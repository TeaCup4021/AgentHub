from __future__ import annotations

from uuid import uuid4
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.deployment import DeploymentService


def test_default_dockerfile_for_static_site_uses_nginx():
    dockerfile = DeploymentService._default_dockerfile({
        "index.html": "<h1>Hello</h1>",
    })

    assert "FROM nginx" in dockerfile
    assert "COPY . /usr/share/nginx/html" in dockerfile
    assert "EXPOSE 80" in dockerfile


def test_default_dockerfile_for_package_json_builds_node_then_nginx():
    dockerfile = DeploymentService._default_dockerfile({
        "package.json": '{"scripts":{"build":"vite build"}}',
        "src/App.tsx": "export default function App() { return null }",
    })

    assert "FROM node:20-alpine AS build" in dockerfile
    assert "RUN npm run build" in dockerfile
    assert "FROM nginx" in dockerfile


def test_find_static_build_dir_prefers_index_html_output(tmp_path: Path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<h1>Hello</h1>", encoding="utf-8")

    assert DeploymentService._find_static_build_dir(tmp_path) == dist


def test_read_files_from_dir_preserves_binary_bytes(tmp_path: Path):
    (tmp_path / "index.html").write_text("<h1>Hello</h1>", encoding="utf-8")
    (tmp_path / "logo.bin").write_bytes(b"\x00\xff")

    files = DeploymentService._read_files_from_dir(tmp_path)

    assert files["index.html"] == b"<h1>Hello</h1>"
    assert files["logo.bin"] == b"\x00\xff"


def test_relativize_root_asset_paths_rewrites_vite_index():
    files = {
        "index.html": b'<script type="module" src="/assets/index-abc.js"></script>',
        "assets/index-abc.js": b"console.log('ok')",
    }

    rewritten = DeploymentService._relativize_root_asset_paths(files)

    assert b'src="./assets/index-abc.js"' in rewritten["index.html"]


def test_ensure_vite_react_config_adds_missing_plugin_config(tmp_path: Path):
    files = {
        "package.json": (
            '{"scripts":{"build":"vite build"},"dependencies":{"react":"^18.3.1",'
            '"react-dom":"^18.3.1"},"devDependencies":{"vite":"^6.0.0",'
            '"@vitejs/plugin-react":"^4.3.4"}}'
        ),
        "src/App.jsx": "export default function App() { return <h1>Hello</h1> }",
        "src/main.jsx": "import App from './App';",
    }

    added = DeploymentService._ensure_vite_react_config(tmp_path, files)

    assert added is True
    config = (tmp_path / "vite.config.js").read_text(encoding="utf-8")
    assert "from 'vite'" in config
    assert "from '@vitejs/plugin-react'" in config
    assert "plugins: [react()]" in config


def test_ensure_vite_react_config_preserves_existing_config(tmp_path: Path):
    files = {
        "package.json": (
            '{"scripts":{"build":"vite build"},"dependencies":{"react":"^18.3.1"},'
            '"devDependencies":{"vite":"^6.0.0","@vitejs/plugin-react":"^4.3.4"}}'
        ),
        "vite.config.ts": "export default {}",
    }

    added = DeploymentService._ensure_vite_react_config(tmp_path, files)

    assert added is False
    assert not (tmp_path / "vite.config.js").exists()


def test_ensure_vite_react_config_uses_automatic_runtime_without_plugin(tmp_path: Path):
    files = {
        "package.json": (
            '{"scripts":{"build":"vite build"},"dependencies":{"react":"^18.3.1",'
            '"react-dom":"^18.3.1"},"devDependencies":{"vite":"^6.0.0"}}'
        ),
        "src/App.jsx": "export default function App() { return <h1>Hello</h1> }",
    }

    added = DeploymentService._ensure_vite_react_config(tmp_path, files)

    assert added is True
    config = (tmp_path / "vite.config.js").read_text(encoding="utf-8")
    assert "jsx: 'automatic'" in config
    assert "plugins: [react()]" not in config


def test_command_failure_message_includes_command_tail():
    result = SimpleNamespace(returncode=1, stdout="first\nsecond\n", stderr="bad\nworse\n")

    message = DeploymentService._command_failure_message("docker build", result)

    assert message.startswith("docker build failed:")
    assert "bad" in message
    assert "second" in message


def test_select_static_container_plan_uses_local_busybox_fallback(monkeypatch):
    def _run_command(args, cwd, timeout):
        if args[:3] == ["docker.exe", "image", "inspect"]:
            image = args[3]
            return SimpleNamespace(
                returncode=0 if image == "redis:7-alpine" else 1,
                stdout="",
                stderr="",
            )
        if args[:5] == ["docker.exe", "run", "--rm", "--entrypoint", "busybox"]:
            image = args[5]
            return SimpleNamespace(
                returncode=0 if image == "redis:7-alpine" else 1,
                stdout="",
                stderr="",
            )
        return SimpleNamespace(returncode=1, stdout="", stderr="")

    monkeypatch.setattr(DeploymentService, "_run_command", _run_command)

    plan = DeploymentService._select_static_container_plan("docker.exe", "nginx:1.27-alpine")

    assert plan["image"] == "redis:7-alpine"
    assert plan["source"] == "local_fallback"
    assert plan["server"] == "busybox_nc"
    assert plan["entrypoint"] == "sh"
    assert plan["command"] == [
        f"{DeploymentService.STATIC_CONTAINER_ROOT}/{DeploymentService.STATIC_FALLBACK_SCRIPT}",
    ]


def test_ensure_docker_available_raises_clear_error(monkeypatch):
    monkeypatch.setattr(
        DeploymentService,
        "_run_command",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=1,
            stdout="",
            stderr="permission denied while trying to connect to the docker API",
        ),
    )

    with pytest.raises(RuntimeError, match="Docker daemon is not reachable"):
        DeploymentService._ensure_docker_available("docker.exe")


@pytest.mark.asyncio
async def test_container_without_custom_dockerfile_mounts_static_output(monkeypatch, tmp_path: Path):
    deployment = SimpleNamespace(
        id=uuid4(),
        conversation_id=uuid4(),
        source_files={
            "package.json": '{"scripts":{"build":"vite build"}}',
            "index.html": "<div id=\"root\"></div>",
            "src/main.jsx": "console.log('ok')",
        },
        port=None,
        directory=None,
        runtime_meta={},
        logs=[],
        url=None,
    )
    commands: list[list[str]] = []

    monkeypatch.setattr(DeploymentService, "DEPLOY_BASE_DIR", tmp_path)
    monkeypatch.setattr("shutil.which", lambda name: "docker.exe" if name == "docker" else "npm.cmd")
    monkeypatch.setattr(DeploymentService, "_is_port_in_use", lambda _port: False)
    monkeypatch.setattr(DeploymentService, "_ensure_docker_available", lambda _docker: None)
    monkeypatch.setattr(
        DeploymentService,
        "_select_static_container_plan",
        lambda _docker, preferred_image: DeploymentService._busybox_nc_static_container_plan(
            "redis:7-alpine",
            preferred_image,
            "local_fallback",
        ),
    )

    async def _build_static_output(deployment, kind):
        work_dir = tmp_path / str(deployment.id) / kind
        build_dir = work_dir / "dist"
        build_dir.mkdir(parents=True)
        return {"index.html": "<h1>Built</h1>", "assets/app.js": b"ok"}, work_dir, build_dir

    def _run_command(args, cwd, timeout):
        commands.append(args)
        if args[1] == "run":
            return SimpleNamespace(returncode=0, stdout="container-1\n", stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(DeploymentService, "_build_static_output", _build_static_output)
    monkeypatch.setattr(DeploymentService, "_run_command", _run_command)

    await DeploymentService._build_and_run_container(deployment)

    assert not any(cmd[1] == "build" for cmd in commands)
    docker_run = next(cmd for cmd in commands if cmd[1] == "run")
    assert "--mount" in docker_run
    assert "--entrypoint" in docker_run
    assert "sh" in docker_run
    assert "redis:7-alpine" in docker_run
    assert docker_run[-1] == f"{DeploymentService.STATIC_CONTAINER_ROOT}/{DeploymentService.STATIC_FALLBACK_SCRIPT}"
    assert deployment.runtime_meta["strategy"] == "static_bind_mount"
    assert deployment.runtime_meta["staticImage"] == "redis:7-alpine"
    assert deployment.runtime_meta["staticImageSource"] == "local_fallback"
    assert deployment.runtime_meta["staticServer"] == "busybox_nc"
    assert deployment.url == "http://localhost:8000"
    assert (tmp_path / str(deployment.id) / "container" / "www" / "index.html").exists()
    fallback_script = tmp_path / str(deployment.id) / "container" / "www" / DeploymentService.STATIC_FALLBACK_SCRIPT
    assert fallback_script.exists()
    assert "busybox nc -l -p 80" in fallback_script.read_text(encoding="utf-8")


def test_append_command_log_records_stdout_and_stderr():
    deployment = SimpleNamespace(logs=[])
    result = SimpleNamespace(returncode=1, stdout="ok\n", stderr="bad\n")

    DeploymentService._append_command_log(deployment, result, "demo")

    assert "demo exited with 1" in deployment.logs
    assert "demo stdout: ok" in deployment.logs
    assert "demo stderr: bad" in deployment.logs


@pytest.mark.asyncio
async def test_package_source_uses_zip_download_filename(monkeypatch):
    uploaded: dict[str, object] = {}
    deployment = SimpleNamespace(
        source_files={"index.html": "<h1>Hello</h1>", "src/main.js": "console.log('ok')"},
        download_url=None,
        runtime_meta={},
    )

    def _upload_file(payload, object_name, content_type):
        uploaded["payload"] = payload
        uploaded["object_name"] = object_name
        uploaded["content_type"] = content_type

    monkeypatch.setattr("app.services.deployment.storage.upload_file", _upload_file)

    await DeploymentService._package_source(deployment)

    assert deployment.download_url.endswith("/download?filename=source.zip")
    assert deployment.runtime_meta["sourcePackageFileName"] == "source.zip"
    assert deployment.runtime_meta["sourcePackageSize"] == len(uploaded["payload"])
    assert uploaded["content_type"] == "application/zip"
    assert bytes(uploaded["payload"]).startswith(b"PK\x03\x04")
