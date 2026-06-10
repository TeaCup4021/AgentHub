"""Deployment API endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user_id
from app.schemas.deployment import (
    DeploymentActionRequest,
    DeploymentCreate,
    DeploymentResponse,
    DeploymentStatus,
    DeploymentList,
)
from app.services.deployment import DeploymentService

logger = logging.getLogger("agenthub.api.deployments")
router = APIRouter(prefix="/deployments", tags=["deployments"])


@router.post("/conversations/{conv_id}", response_model=DeploymentResponse)
async def create_deployment(
    conv_id: UUID,
    data: DeploymentCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a deployment job from conversation artifacts or explicit files."""
    try:
        deployment = await DeploymentService.create_job(
            db=db,
            conv_id=conv_id,
            user_id=user_id,
            name=data.name,
            source_files=data.files,
            target=data.target,
            trigger_message_id=data.trigger_message_id,
            port=data.port,
        )
        await db.commit()
        logger.info(f"Created deployment {deployment.id} for conv {conv_id}")
        return deployment
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to create deployment: {e}")
        raise HTTPException(status_code=500, detail="Failed to create deployment")


@router.post("/{deployment_id}/actions", response_model=DeploymentResponse)
async def run_deployment_action(
    deployment_id: UUID,
    data: DeploymentActionRequest,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Run a deployment action for an existing job."""
    deployment = await DeploymentService.get_deployment(db, deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    if deployment.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    await DeploymentService.run_action(
        db=db,
        deployment=deployment,
        target=data.target or deployment.target,
        port=data.port,
    )
    await db.commit()
    await db.refresh(deployment)
    return deployment


@router.post("/{deployment_id}/actions/{target}", response_model=DeploymentResponse)
async def run_named_deployment_action(
    deployment_id: UUID,
    target: str,
    data: DeploymentActionRequest | None = None,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Run a named deployment action (preview/static_site/container/source_package)."""
    deployment = await DeploymentService.get_deployment(db, deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    if deployment.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    await DeploymentService.run_action(
        db=db,
        deployment=deployment,
        target=target,
        port=data.port if data else None,
    )
    await db.commit()
    await db.refresh(deployment)
    return deployment


@router.get("/{deployment_id}", response_model=DeploymentStatus)
async def get_deployment_status(
    deployment_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get deployment status."""
    deployment = await DeploymentService.get_deployment(db, deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    if deployment.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    status = await DeploymentService.get_deployment_status(deployment)
    return {
        "deployment": deployment,
        **status,
    }


@router.post("/{deployment_id}/stop")
async def stop_deployment(
    deployment_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Stop a running deployment."""
    deployment = await DeploymentService.get_deployment(db, deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    if deployment.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    success = await DeploymentService.stop_deployment(db, deployment_id)
    await db.commit()

    if not success:
        raise HTTPException(status_code=400, detail="Deployment already stopped")

    return {"status": "stopped"}


@router.get("/conversations/{conv_id}", response_model=DeploymentList)
async def list_deployments(
    conv_id: UUID,
    active_only: bool = True,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List deployments for a conversation."""
    deployments = await DeploymentService.list_deployments(
        db=db,
        conv_id=conv_id,
        user_id=user_id,
        active_only=active_only,
    )
    return {
        "deployments": deployments,
        "total": len(deployments),
    }


@router.post("/cleanup")
async def cleanup_stale_deployments(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Clean up stale deployments (admin/maintenance endpoint)."""
    await DeploymentService.cleanup_stale_deployments(db)
    await db.commit()
    return {"status": "cleaned"}
