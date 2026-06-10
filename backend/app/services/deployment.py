"""Deployment service for preview and package jobs."""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.deployment import Deployment
from app.services import storage
from app.services.deployment_source import DeploymentSourceResolver

logger = logging.getLogger("agenthub.deployment")

try:
    import psutil
except ModuleNotFoundError:  # pragma: no cover - exercised by deployments missing optional deps
    psutil = None


class DeploymentService:
    """Manage deployment jobs and legacy local preview processes."""

    PORT_MIN = 8000
    PORT_MAX = 9000
    DEPLOY_BASE_DIR = Path(os.path.expanduser("~/.agenthub/deployments"))
    STATIC_BUILD_TIMEOUT_SECONDS = 180
    CONTAINER_BUILD_TIMEOUT_SECONDS = 300
    STATIC_CONTAINER_ROOT = "/usr/share/nginx/html"
    STATIC_FALLBACK_SCRIPT = ".agenthub-serve.sh"
    DEFAULT_STATIC_CONTAINER_IMAGE = "nginx:1.27-alpine"
    STATIC_CONTAINER_FALLBACK_IMAGES = (
        "nginx:alpine",
        "nginx:latest",
        "busybox:latest",
        "busybox:stable",
        "alpine:latest",
        "redis:7-alpine",
        "postgres:16-alpine",
    )
    VITE_CONFIG_FILES = {
        "vite.config.js",
        "vite.config.mjs",
        "vite.config.ts",
        "vite.config.mts",
    }

    @staticmethod
    async def find_available_port(db: AsyncSession) -> Optional[int]:
        result = await db.execute(
            select(Deployment.port).where(
                Deployment.is_active == True,
                Deployment.port.is_not(None),
            )
        )
        used_ports = {row[0] for row in result.all()}

        for port in range(DeploymentService.PORT_MIN, DeploymentService.PORT_MAX):
            if port not in used_ports and not DeploymentService._is_port_in_use(port):
                return port
        return None

    @staticmethod
    def _is_port_in_use(port: int) -> bool:
        import socket

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(("localhost", port)) == 0

    @staticmethod
    async def create_job(
        db: AsyncSession,
        conv_id: UUID,
        user_id: UUID,
        name: str | None = None,
        source_files: dict[str, str] | None = None,
        target: str = "preview",
        trigger_message_id: UUID | None = None,
        auto_run: bool = False,
        port: Optional[int] = None,
    ) -> Deployment:
        files, summary = await DeploymentSourceResolver.resolve_from_conversation(
            db=db,
            conversation_id=conv_id,
            explicit_files=source_files,
        )
        if not files:
            raise ValueError("No deployable source files found in this conversation")

        deployment = Deployment(
            conversation_id=conv_id,
            user_id=user_id,
            trigger_message_id=trigger_message_id,
            name=name or "AgentHub Deployment",
            target=target,
            port=port,
            directory=None,
            source_files=files,
            source_summary=summary,
            logs=["Deployment job created"],
            status="ready",
            is_active=True,
        )
        db.add(deployment)
        await db.flush()

        if auto_run:
            await DeploymentService.run_action(db, deployment, target=target, port=port)

        return deployment

    @staticmethod
    async def create_deployment(
        db: AsyncSession,
        conv_id: UUID,
        user_id: UUID,
        name: str,
        source_files: dict[str, str],
        port: Optional[int] = None,
    ) -> Deployment:
        """Backward-compatible local HTTP server deployment."""
        files = DeploymentSourceResolver.normalize_files(source_files)
        if not files:
            raise ValueError("No deployable source files found")

        if port is None:
            port = await DeploymentService.find_available_port(db)
            if port is None:
                raise ValueError("No available ports in range")

        deploy_dir = DeploymentService.DEPLOY_BASE_DIR / str(conv_id) / f"{name}-{uuid4().hex[:8]}"
        deploy_dir.mkdir(parents=True, exist_ok=True)
        DeploymentService._write_files_to_dir(deploy_dir, files)

        process = subprocess.Popen(
            ["python", "-m", "http.server", str(port)],
            cwd=str(deploy_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )

        deployment = Deployment(
            conversation_id=conv_id,
            user_id=user_id,
            name=name,
            target="preview",
            port=port,
            directory=str(deploy_dir),
            url=f"http://localhost:{port}",
            source_files=files,
            source_summary=DeploymentSourceResolver.build_summary(files, source="request"),
            logs=[f"Started local HTTP server on port {port}"],
            process_pid=process.pid,
            status="running",
            is_active=True,
        )
        db.add(deployment)
        await db.flush()

        logger.info("Started local deployment %s on port %s PID=%s", deployment.id, port, process.pid)
        return deployment

    @staticmethod
    async def run_action(
        db: AsyncSession,
        deployment: Deployment,
        target: str,
        port: Optional[int] = None,
    ) -> Deployment:
        target = target or deployment.target or "preview"
        deployment.target = target
        deployment.status = "building"
        deployment.error = None
        DeploymentService._append_log(deployment, f"Starting {target} action")
        await db.flush()

        try:
            if target in {"preview", "static_site"}:
                if (
                    target == "static_site"
                    or DeploymentService._should_build_static_project(deployment.source_files or {})
                ):
                    await DeploymentService._build_and_publish_static_site(
                        deployment,
                        kind="preview" if target == "preview" else "static",
                    )
                else:
                    await DeploymentService._publish_static_files(deployment, deployment.source_files or {})
                deployment.status = "running"
                DeploymentService._append_log(deployment, "Static files published")
            elif target == "source_package":
                await DeploymentService._package_source(deployment)
                deployment.status = "packaged"
                DeploymentService._append_log(deployment, "Source package generated")
            elif target == "container":
                if port is None and deployment.port is None:
                    port = await DeploymentService.find_available_port(db)
                await DeploymentService._build_and_run_container(deployment, port=port)
                deployment.status = "running"
                DeploymentService._append_log(deployment, "Container is running")
            else:
                raise ValueError(f"Unsupported deployment target: {target}")
        except Exception as exc:
            deployment.status = "failed"
            deployment.error = str(exc)
            DeploymentService._append_log(deployment, f"Action failed: {exc}")
            logger.exception("Deployment action failed deployment=%s target=%s", deployment.id, target)

        await db.flush()
        return deployment

    @staticmethod
    async def stop_deployment(db: AsyncSession, deployment_id: UUID) -> bool:
        deployment = await db.get(Deployment, deployment_id)
        if not deployment or not deployment.is_active:
            return False

        runtime_meta = deployment.runtime_meta or {}
        container_id = runtime_meta.get("containerId") or runtime_meta.get("container_id")
        if container_id:
            docker = shutil.which("docker")
            if docker:
                stop_result = DeploymentService._run_command(
                    [docker, "rm", "-f", str(container_id)],
                    cwd=None,
                    timeout=30,
                )
                DeploymentService._append_command_log(deployment, stop_result, "docker rm")

        if deployment.process_pid:
            if psutil is None:
                DeploymentService._append_log(deployment, "psutil unavailable; skipped process stop")
                logger.warning("psutil unavailable; cannot stop PID=%s", deployment.process_pid)
            else:
                try:
                    process = psutil.Process(deployment.process_pid)
                    process.terminate()
                    process.wait(timeout=5)
                    logger.info("Stopped deployment %s PID=%s", deployment_id, deployment.process_pid)
                except psutil.NoSuchProcess:
                    logger.warning("Process %s not found", deployment.process_pid)
                except psutil.TimeoutExpired:
                    logger.warning("Process %s did not terminate, killing", deployment.process_pid)
                    process.kill()
                except Exception:
                    logger.exception("Error stopping deployment %s", deployment_id)

        deployment.status = "stopped"
        deployment.is_active = False
        deployment.stopped_at = datetime.now(timezone.utc)
        DeploymentService._append_log(deployment, "Deployment stopped")
        await db.flush()
        return True

    @staticmethod
    async def get_deployment(db: AsyncSession, deployment_id: UUID) -> Optional[Deployment]:
        return await db.get(Deployment, deployment_id)

    @staticmethod
    async def list_deployments(
        db: AsyncSession,
        conv_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
        active_only: bool = True,
    ) -> list[Deployment]:
        query = select(Deployment)

        if conv_id:
            query = query.where(Deployment.conversation_id == conv_id)
        if user_id:
            query = query.where(Deployment.user_id == user_id)
        if active_only:
            query = query.where(Deployment.is_active == True)

        query = query.order_by(Deployment.created_at.desc())
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_deployment_status(deployment: Deployment) -> dict:
        process_alive = False
        if deployment.process_pid and psutil is not None:
            try:
                process = psutil.Process(deployment.process_pid)
                process_alive = process.is_running()
            except psutil.NoSuchProcess:
                pass

        if deployment.stopped_at:
            uptime = (deployment.stopped_at - deployment.started_at).total_seconds()
        else:
            uptime = (datetime.now(timezone.utc) - deployment.started_at).total_seconds()

        status = deployment.status
        if deployment.process_pid and psutil is not None and not process_alive and status == "running":
            status = "stopped"

        return {
            "status": status,
            "uptime_seconds": int(uptime),
            "url": deployment.url or (f"http://localhost:{deployment.port}" if deployment.port else None),
            "download_url": deployment.download_url,
            "runtime_meta": deployment.runtime_meta or {},
            "logs": deployment.logs or [],
            "error": deployment.error,
            "process_alive": process_alive,
        }

    @staticmethod
    async def cleanup_stale_deployments(db: AsyncSession):
        if psutil is None:
            logger.warning("psutil unavailable; skipping stale deployment cleanup")
            return

        result = await db.execute(
            select(Deployment).where(
                Deployment.is_active == True,
                Deployment.status == "running",
                Deployment.process_pid.is_not(None),
            )
        )
        deployments = result.scalars().all()

        for deployment in deployments:
            if deployment.process_pid:
                try:
                    process = psutil.Process(deployment.process_pid)
                    if not process.is_running():
                        deployment.status = "stopped"
                        deployment.is_active = False
                        deployment.stopped_at = datetime.now(timezone.utc)
                        DeploymentService._append_log(deployment, "Cleaned up stale process")
                except psutil.NoSuchProcess:
                    deployment.status = "stopped"
                    deployment.is_active = False
                    deployment.stopped_at = datetime.now(timezone.utc)
                    DeploymentService._append_log(deployment, "Cleaned up missing process")

        await db.flush()

    @staticmethod
    def build_status_artifact(deployment: Deployment) -> dict:
        content = {
            "deploymentId": str(deployment.id),
            "status": deployment.status,
            "target": deployment.target,
            "url": deployment.url,
            "downloadUrl": deployment.download_url,
            "sourceSummary": deployment.source_summary or {},
            "runtimeMeta": deployment.runtime_meta or {},
            "logs": deployment.logs or [],
            "error": deployment.error,
        }
        if deployment.port is not None:
            content["port"] = deployment.port
        return {
            "id": f"deployment-{deployment.id}",
            "artifactType": "deploy_status",
            "title": deployment.name or "Deployment",
            "content": content,
        }

    @staticmethod
    async def _publish_static_files(deployment: Deployment, files: dict[str, str | bytes]) -> None:
        if not files:
            raise ValueError("No source files available for deployment")

        base_key = f"serve/{deployment.conversation_id}/{deployment.id}"
        for path, content in files.items():
            media_type = DeploymentService._guess_content_type(path)
            payload = content if isinstance(content, bytes) else content.encode("utf-8")
            storage.upload_file(
                payload,
                f"{base_key}/{path}",
                media_type,
            )
        deployment.url = (
            f"{settings.PREVIEW_SERVER_URL}/serve/"
            f"{deployment.conversation_id}/{deployment.id}/index.html"
        )
        deployment.runtime_meta = {
            **(deployment.runtime_meta or {}),
            "publishedFileCount": len(files),
            "publishedEntry": "index.html",
            "mode": "static_publish",
        }

    @staticmethod
    async def _build_and_publish_static_site(deployment: Deployment, kind: str = "static") -> None:
        publish_files, _work_dir, build_dir = await DeploymentService._build_static_output(deployment, kind)
        await DeploymentService._publish_static_files(deployment, publish_files)
        deployment.runtime_meta = {
            **(deployment.runtime_meta or {}),
            "mode": "static_build" if build_dir else "static_publish",
            "buildDirectory": str(build_dir) if build_dir else None,
        }

    @staticmethod
    async def _build_static_output(
        deployment: Deployment,
        kind: str,
    ) -> tuple[dict[str, str | bytes], Path, Path | None]:
        source_files = deployment.source_files or {}
        if not source_files:
            raise ValueError("No source files available for static site deployment")

        work_dir = DeploymentService._prepare_work_dir(deployment, kind)
        DeploymentService._write_files_to_dir(work_dir, source_files)
        DeploymentService._append_log(deployment, f"Prepared build workspace: {work_dir}")
        if DeploymentService._ensure_vite_react_config(work_dir, source_files):
            DeploymentService._append_log(deployment, "Added default Vite React config")

        build_dir = None
        if DeploymentService._should_build_static_project(source_files):
            npm = shutil.which("npm.cmd") or shutil.which("npm")
            if not npm:
                raise RuntimeError("npm is not available; cannot build package.json project")

            install_result = DeploymentService._run_command(
                [npm, "install", "--no-audit", "--no-fund"],
                cwd=work_dir,
                timeout=DeploymentService.STATIC_BUILD_TIMEOUT_SECONDS,
            )
            DeploymentService._append_command_log(deployment, install_result, "npm install")
            if install_result.returncode != 0:
                raise RuntimeError(DeploymentService._command_failure_message("npm install", install_result))

            build_result = DeploymentService._run_command(
                [npm, "run", "build"],
                cwd=work_dir,
                timeout=DeploymentService.STATIC_BUILD_TIMEOUT_SECONDS,
            )
            DeploymentService._append_command_log(deployment, build_result, "npm run build")
            if build_result.returncode != 0:
                raise RuntimeError(DeploymentService._command_failure_message("npm run build", build_result))

            build_dir = DeploymentService._find_static_build_dir(work_dir)
            if not build_dir:
                raise RuntimeError("Build succeeded but no static output directory was found")
            publish_files = DeploymentService._read_files_from_dir(build_dir)
            if not publish_files:
                raise RuntimeError(f"No publishable files found in {build_dir}")
            publish_files = DeploymentService._relativize_root_asset_paths(publish_files)
            DeploymentService._append_log(deployment, f"Using build output: {build_dir}")
            return publish_files, work_dir, build_dir

        return source_files, work_dir, None

    @staticmethod
    async def _build_and_run_container(deployment: Deployment, port: Optional[int] = None) -> None:
        source_files = deployment.source_files or {}
        if not source_files:
            raise ValueError("No source files available for container deployment")

        docker = shutil.which("docker")
        if not docker:
            raise RuntimeError("Docker is not available on this machine")
        DeploymentService._ensure_docker_available(docker)

        host_port = port or deployment.port
        if host_port is None:
            # This helper is sync, so only check OS state here. DB collisions are
            # already rare because completed /serve deployments do not reserve ports.
            for candidate in range(DeploymentService.PORT_MIN, DeploymentService.PORT_MAX):
                if not DeploymentService._is_port_in_use(candidate):
                    host_port = candidate
                    break
        if host_port is None:
            raise RuntimeError("No available ports in deployment range")

        image_tag = f"agenthub-deploy-{deployment.id}".lower()
        container_name = f"agenthub-deploy-{deployment.id}".lower()
        has_custom_dockerfile = any(name.lower() == "dockerfile" for name in source_files)
        work_dir: Path
        build_dir: Path | None = None
        static_dir: Path | None = None
        run_image = image_tag
        static_container_plan: dict[str, object] | None = None

        if has_custom_dockerfile:
            work_dir = DeploymentService._prepare_work_dir(deployment, "container")
            DeploymentService._write_files_to_dir(work_dir, source_files)
            build_result = DeploymentService._run_command(
                [docker, "build", "-t", image_tag, "."],
                cwd=work_dir,
                timeout=DeploymentService.CONTAINER_BUILD_TIMEOUT_SECONDS,
            )
            DeploymentService._append_command_log(deployment, build_result, "docker build")
            if build_result.returncode != 0:
                raise RuntimeError(DeploymentService._command_failure_message("docker build", build_result))
        else:
            publish_files, work_dir, build_dir = await DeploymentService._build_static_output(deployment, "container")
            static_dir = work_dir / "www"
            if static_dir.exists():
                shutil.rmtree(static_dir)
            static_dir.mkdir(parents=True, exist_ok=True)
            DeploymentService._write_publish_files_to_dir(static_dir, publish_files)
            preferred_image = (
                os.getenv("AGENTHUB_DEPLOY_STATIC_IMAGE")
                or DeploymentService.DEFAULT_STATIC_CONTAINER_IMAGE
            )
            static_container_plan = DeploymentService._select_static_container_plan(docker, preferred_image)
            if static_container_plan["server"] == "busybox_nc":
                DeploymentService._write_busybox_nc_server_script(static_dir)
            run_image = str(static_container_plan["image"])
            if static_container_plan["source"] == "local_fallback":
                DeploymentService._append_log(
                    deployment,
                    f"Preferred static image {preferred_image} not found locally; using {run_image}",
                )
            elif static_container_plan["source"] == "pull_candidate":
                DeploymentService._append_log(
                    deployment,
                    f"Static image {run_image} not found locally; Docker will try to pull it",
                )
            DeploymentService._append_log(
                deployment,
                f"Using static container image: {run_image} ({static_container_plan['server']})",
            )

        # Remove a same-name stale container before running the new one.
        DeploymentService._run_command(
            [docker, "rm", "-f", container_name],
            cwd=None,
            timeout=30,
        )

        run_args = [docker, "run", "-d", "--name", container_name, "-p", f"{host_port}:80"]
        if static_dir is not None:
            mount_target = str(static_container_plan["mountTarget"]) if static_container_plan else DeploymentService.STATIC_CONTAINER_ROOT
            run_args.extend([
                "--mount",
                (
                    "type=bind,"
                    f"source={DeploymentService._docker_bind_source(static_dir)},"
                    f"target={mount_target},readonly"
                ),
            ])
            entrypoint = static_container_plan.get("entrypoint") if static_container_plan else None
            if entrypoint:
                run_args.extend(["--entrypoint", str(entrypoint)])
        run_args.append(run_image)
        if static_container_plan:
            run_args.extend([str(arg) for arg in static_container_plan["command"]])
        run_result = DeploymentService._run_command(
            run_args,
            cwd=None,
            timeout=60,
        )
        DeploymentService._append_command_log(deployment, run_result, "docker run")
        if run_result.returncode != 0:
            raise RuntimeError(DeploymentService._command_failure_message("docker run", run_result))

        container_id = run_result.stdout.strip().splitlines()[-1] if run_result.stdout.strip() else container_name
        deployment.port = host_port
        deployment.url = f"http://localhost:{host_port}"
        deployment.runtime_meta = {
            **(deployment.runtime_meta or {}),
            "mode": "container",
            "imageTag": image_tag if has_custom_dockerfile else None,
            "staticImage": run_image if not has_custom_dockerfile else None,
            "staticImageRequested": (
                static_container_plan.get("preferredImage") if static_container_plan else None
            ),
            "staticImageSource": (
                static_container_plan.get("source") if static_container_plan else None
            ),
            "staticServer": (
                static_container_plan.get("server") if static_container_plan else None
            ),
            "containerName": container_name,
            "containerId": container_id,
            "hostPort": host_port,
            "containerPort": 80,
            "workspace": str(work_dir),
            "staticDirectory": str(static_dir) if static_dir else None,
            "buildDirectory": str(build_dir) if build_dir else None,
            "strategy": "custom_dockerfile" if has_custom_dockerfile else "static_bind_mount",
        }

    @staticmethod
    async def _package_source(deployment: Deployment) -> None:
        files = deployment.source_files or {}
        if not files:
            raise ValueError("No source files available for packaging")

        buffer = BytesIO()
        with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path, content in sorted(files.items()):
                archive.writestr(path, content)
        payload = buffer.getvalue()
        file_id = str(uuid4())
        storage.upload_file(
            payload,
            f"files/{file_id}",
            "application/zip",
        )
        deployment.download_url = f"/api/v1/files/{file_id}/download?filename=source.zip"
        deployment.runtime_meta = {
            **(deployment.runtime_meta or {}),
            "sourcePackageFileName": "source.zip",
            "sourcePackageFileId": file_id,
            "sourcePackageSize": len(payload),
        }

    @staticmethod
    def _write_files_to_dir(deploy_dir: Path, files: dict[str, str]) -> None:
        deploy_root = deploy_dir.resolve()
        for filename, content in files.items():
            file_path = (deploy_dir / filename).resolve()
            try:
                file_path.relative_to(deploy_root)
            except ValueError:
                raise ValueError(f"Invalid deployment file path: {filename}")
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content, encoding="utf-8")

    @staticmethod
    def _write_publish_files_to_dir(deploy_dir: Path, files: dict[str, str | bytes]) -> None:
        deploy_root = deploy_dir.resolve()
        for filename, content in files.items():
            file_path = (deploy_dir / filename).resolve()
            try:
                file_path.relative_to(deploy_root)
            except ValueError:
                raise ValueError(f"Invalid deployment file path: {filename}")
            file_path.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(content, bytes):
                file_path.write_bytes(content)
            else:
                file_path.write_text(content, encoding="utf-8")

    @staticmethod
    def _prepare_work_dir(deployment: Deployment, kind: str) -> Path:
        work_dir = DeploymentService.DEPLOY_BASE_DIR / str(deployment.conversation_id) / str(deployment.id) / kind
        if work_dir.exists():
            shutil.rmtree(work_dir)
        work_dir.mkdir(parents=True, exist_ok=True)
        deployment.directory = str(work_dir)
        return work_dir

    @staticmethod
    def _should_build_static_project(files: dict[str, str]) -> bool:
        if "package.json" not in files:
            return False
        package = files.get("package.json") or ""
        return '"build"' in package or "'build'" in package or "vite" in package.lower()

    @staticmethod
    def _find_static_build_dir(work_dir: Path) -> Path | None:
        for name in ("dist", "build", "out", "public"):
            candidate = work_dir / name
            if candidate.is_dir() and (candidate / "index.html").exists():
                return candidate
        return None

    @staticmethod
    def _read_files_from_dir(root: Path) -> dict[str, bytes]:
        files: dict[str, bytes] = {}
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(root).as_posix()
            files[rel] = path.read_bytes()
        return files

    @staticmethod
    def _relativize_root_asset_paths(files: dict[str, str | bytes]) -> dict[str, str | bytes]:
        content = files.get("index.html")
        if content is None:
            return files

        raw = content.decode("utf-8", errors="replace") if isinstance(content, bytes) else content
        rewritten = re.sub(
            r'((?:src|href)=["\'])/((?:assets|static|dist|build|favicon|manifest)[^"\']*)',
            r"\1./\2",
            raw,
        )
        rewritten = rewritten.replace('url("/assets/', 'url("./assets/')
        rewritten = rewritten.replace("url('/assets/", "url('./assets/")
        rewritten = rewritten.replace("url(/assets/", "url(./assets/")

        if rewritten == raw:
            return files
        updated = dict(files)
        updated["index.html"] = rewritten.encode("utf-8") if isinstance(content, bytes) else rewritten
        return updated

    @staticmethod
    def _ensure_vite_react_config(work_dir: Path, files: dict[str, str]) -> bool:
        """Add a minimal Vite React config for generated projects that omit it."""
        if DeploymentService._has_root_vite_config(files):
            return False

        config = DeploymentService._vite_react_config_content(files)
        if not config:
            return False

        config_path = work_dir / "vite.config.js"
        if config_path.exists():
            return False

        config_path.write_text(config, encoding="utf-8")
        return True

    @staticmethod
    def _has_root_vite_config(files: dict[str, str]) -> bool:
        return any(
            path.replace("\\", "/").lower() in DeploymentService.VITE_CONFIG_FILES
            for path in files
        )

    @staticmethod
    def _vite_react_config_content(files: dict[str, str]) -> str | None:
        package_raw = files.get("package.json")
        if not package_raw:
            return None

        try:
            package = json.loads(package_raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(package, dict):
            return None

        dependencies: dict[str, str] = {}
        for key in ("dependencies", "devDependencies", "peerDependencies"):
            value = package.get(key)
            if isinstance(value, dict):
                dependencies.update({str(name): str(version) for name, version in value.items()})

        scripts = package.get("scripts") if isinstance(package.get("scripts"), dict) else {}
        build_script = str(scripts.get("build", "")) if scripts else ""
        uses_vite = "vite" in dependencies or "vite" in build_script.lower()
        uses_react = (
            "react" in dependencies
            or "react-dom" in dependencies
            or "@vitejs/plugin-react" in dependencies
            or "@vitejs/plugin-react-swc" in dependencies
        )
        if not uses_vite or not uses_react:
            return None

        if "@vitejs/plugin-react" in dependencies:
            plugin_name = "@vitejs/plugin-react"
        elif "@vitejs/plugin-react-swc" in dependencies:
            plugin_name = "@vitejs/plugin-react-swc"
        else:
            return (
                "import { defineConfig } from 'vite';\n\n"
                "export default defineConfig({\n"
                "  esbuild: {\n"
                "    jsx: 'automatic',\n"
                "  },\n"
                "});\n"
            )

        return (
            "import { defineConfig } from 'vite';\n"
            f"import react from '{plugin_name}';\n\n"
            "export default defineConfig({\n"
            "  plugins: [react()],\n"
            "});\n"
        )

    @staticmethod
    def _ensure_docker_available(docker: str) -> None:
        result = DeploymentService._run_command(
            [docker, "version", "--format", "{{.Server.Version}}"],
            cwd=None,
            timeout=30,
        )
        if result.returncode == 0:
            return

        message = DeploymentService._command_failure_message("docker version", result)
        raise RuntimeError(f"Docker daemon is not reachable: {message}")

    @staticmethod
    def _select_static_container_plan(docker: str, preferred_image: str) -> dict[str, object]:
        preferred_image = preferred_image.strip() or DeploymentService.DEFAULT_STATIC_CONTAINER_IMAGE
        if DeploymentService._docker_image_exists(docker, preferred_image):
            return DeploymentService._nginx_static_container_plan(preferred_image, preferred_image, "local_preferred")

        for image in DeploymentService.STATIC_CONTAINER_FALLBACK_IMAGES:
            if image == preferred_image:
                continue
            if not DeploymentService._docker_image_exists(docker, image):
                continue
            if DeploymentService._is_nginx_image(image):
                return DeploymentService._nginx_static_container_plan(image, preferred_image, "local_fallback")
            if DeploymentService._docker_image_supports_busybox_nc(docker, image):
                return DeploymentService._busybox_nc_static_container_plan(image, preferred_image, "local_fallback")

        return DeploymentService._nginx_static_container_plan(preferred_image, preferred_image, "pull_candidate")

    @staticmethod
    def _docker_image_exists(docker: str, image: str) -> bool:
        result = DeploymentService._run_command(
            [docker, "image", "inspect", image],
            cwd=None,
            timeout=30,
        )
        return result.returncode == 0

    @staticmethod
    def _docker_image_supports_busybox_nc(docker: str, image: str) -> bool:
        result = DeploymentService._run_command(
            [docker, "run", "--rm", "--entrypoint", "busybox", image, "nc", "--help"],
            cwd=None,
            timeout=30,
        )
        return result.returncode == 0

    @staticmethod
    def _nginx_static_container_plan(
        image: str,
        preferred_image: str,
        source: str,
    ) -> dict[str, object]:
        return {
            "image": image,
            "preferredImage": preferred_image,
            "source": source,
            "server": "nginx",
            "mountTarget": DeploymentService.STATIC_CONTAINER_ROOT,
            "entrypoint": None,
            "command": [],
        }

    @staticmethod
    def _busybox_nc_static_container_plan(
        image: str,
        preferred_image: str,
        source: str,
    ) -> dict[str, object]:
        return {
            "image": image,
            "preferredImage": preferred_image,
            "source": source,
            "server": "busybox_nc",
            "mountTarget": DeploymentService.STATIC_CONTAINER_ROOT,
            "entrypoint": "sh",
            "command": [
                f"{DeploymentService.STATIC_CONTAINER_ROOT}/{DeploymentService.STATIC_FALLBACK_SCRIPT}",
            ],
        }

    @staticmethod
    def _write_busybox_nc_server_script(static_dir: Path) -> None:
        script_path = static_dir / DeploymentService.STATIC_FALLBACK_SCRIPT
        script_path.write_text(DeploymentService._busybox_nc_server_script(), encoding="utf-8", newline="\n")

    @staticmethod
    def _busybox_nc_server_script() -> str:
        root = DeploymentService.STATIC_CONTAINER_ROOT
        return rf"""#!/bin/sh
cat >/tmp/agenthub-serve-one <<'EOF'
#!/bin/sh
ROOT="{root}"
IFS= read -r request || exit 0
set -- $request
path="${{2:-/}}"
path="${{path%%\?*}}"
case "$path" in
  ""|"/") rel="index.html" ;;
  */) rel="${{path#/}}index.html" ;;
  *) rel="${{path#/}}" ;;
esac
case "$rel" in
  *..*|/*) file="" ;;
  *) file="$ROOT/$rel" ;;
esac
[ -d "$file" ] && file="$file/index.html"
[ ! -f "$file" ] && file="$ROOT/index.html"
if [ -f "$file" ]; then
  case "$file" in
    *.html|*.htm) type="text/html; charset=utf-8" ;;
    *.js|*.mjs) type="application/javascript; charset=utf-8" ;;
    *.css) type="text/css; charset=utf-8" ;;
    *.json) type="application/json; charset=utf-8" ;;
    *.svg) type="image/svg+xml" ;;
    *.png) type="image/png" ;;
    *.jpg|*.jpeg) type="image/jpeg" ;;
    *.webp) type="image/webp" ;;
    *.ico) type="image/x-icon" ;;
    *) type="application/octet-stream" ;;
  esac
  printf 'HTTP/1.1 200 OK\r\nContent-Type: %s\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n' "$type"
  cat "$file"
else
  printf 'HTTP/1.1 404 Not Found\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nNot found'
fi
EOF
chmod +x /tmp/agenthub-serve-one
while true; do busybox nc -l -p 80 -e /tmp/agenthub-serve-one; done"""

    @staticmethod
    def _is_nginx_image(image: str) -> bool:
        repository = image.split("@", 1)[0].split(":", 1)[0].lower()
        return repository == "nginx" or repository.endswith("/nginx")

    @staticmethod
    def _docker_bind_source(path: Path) -> str:
        resolved = path.resolve()
        value = str(resolved)
        return value.replace("\\", "/") if os.name == "nt" else value

    @staticmethod
    def _default_dockerfile(files: dict[str, str]) -> str:
        if "package.json" in files:
            return (
                "FROM node:20-alpine AS build\n"
                "WORKDIR /app\n"
                "COPY package*.json ./\n"
                "RUN npm install --no-audit --no-fund\n"
                "COPY . .\n"
                "RUN npm run build\n"
                "FROM nginx:1.27-alpine\n"
                "COPY --from=build /app/dist /usr/share/nginx/html\n"
                "EXPOSE 80\n"
            )
        return (
            "FROM nginx:1.27-alpine\n"
            "COPY . /usr/share/nginx/html\n"
            "EXPOSE 80\n"
        )

    @staticmethod
    def _append_log(deployment: Deployment, message: str) -> None:
        logs = list(deployment.logs or [])
        logs.append(message)
        deployment.logs = logs[-100:]

    @staticmethod
    def _append_command_log(
        deployment: Deployment,
        result: subprocess.CompletedProcess[str],
        label: str,
    ) -> None:
        DeploymentService._append_log(deployment, f"{label} exited with {result.returncode}")
        for stream_name, text in (("stdout", result.stdout), ("stderr", result.stderr)):
            for line in (text or "").splitlines()[-12:]:
                if line.strip():
                    DeploymentService._append_log(deployment, f"{label} {stream_name}: {line[:500]}")

    @staticmethod
    def _command_failure_message(
        label: str,
        result: subprocess.CompletedProcess[str],
    ) -> str:
        lines = []
        for text in (result.stderr, result.stdout):
            for line in (text or "").splitlines():
                stripped = line.strip()
                if stripped:
                    lines.append(stripped)
        tail = "; ".join(lines[-4:])
        return f"{label} failed" + (f": {tail[:1000]}" if tail else "")

    @staticmethod
    def _run_command(
        args: list[str],
        cwd: Path | None,
        timeout: int,
    ) -> subprocess.CompletedProcess[str]:
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        return subprocess.run(
            args,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            startupinfo=startupinfo,
        )

    @staticmethod
    def _guess_content_type(path: str) -> str:
        suffix = Path(path).suffix.lower()
        return {
            ".css": "text/css; charset=utf-8",
            ".html": "text/html; charset=utf-8",
            ".htm": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".mjs": "application/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
            ".txt": "text/plain; charset=utf-8",
            ".xml": "application/xml; charset=utf-8",
        }.get(suffix, "application/octet-stream")
