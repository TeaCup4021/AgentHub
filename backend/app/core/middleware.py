from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import json

class ResponseWrapperMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # Skip for OpenAPI/Swagger UI endpoints
        if request.url.path in ["/docs", "/redoc", "/openapi.json"]:
            return await call_next(request)

        response = await call_next(request)
        
        # 只包装 JSON 响应，跳过 SSE (text/event-stream) 和其他类型
        if response.headers.get("content-type") == "application/json":
            # 读取 body 需要一点特殊处理因为 async iterator
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            
            try:
                data = json.loads(body.decode("utf-8"))
                # 检查是否已经是包装好的格式
                if isinstance(data, dict) and "code" in data and "message" in data and "data" in data:
                    return JSONResponse(content=data, status_code=response.status_code)
                else:
                    wrapped = {"code": response.status_code, "data": data, "message": "success"}
                    return JSONResponse(content=wrapped, status_code=response.status_code)
            except json.JSONDecodeError:
                pass
                
        return response
