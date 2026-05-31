import asyncio, os, sys
sys.path.insert(0, r"D:\AgentHub\backend")
from dotenv import load_dotenv
load_dotenv(r"D:\AgentHub\backend\.env", override=True)
os.environ.setdefault("LITELLM_MODE", "PRODUCTION")

import litellm
litellm.add_function_to_prompt = True

async def test():
    try:
        resp = await litellm.acompletion(
            model='openai/gpt-5.2',
            messages=[{'role':'user','content':'用一句话介绍自己'}],
            timeout=15
        )
        print('SUCCESS:', resp.choices[0].message.content)
    except Exception as e:
        print(f'ERROR: {type(e).__name__}: {e}')

asyncio.run(test())
