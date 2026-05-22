from app.core.celery_app import celery_app
import time

@celery_app.task
def sample_task(x, y):
    time.sleep(1)
    return x + y

