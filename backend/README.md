# Hello Project

一个简单的 Python 示例项目，演示基础函数定义与调用。

## 功能

- `greet(name)` —— 返回 `Hello, {name}!`
- `greet(name, greeting)` —— 返回 `{greeting}, {name}!`（v2 新增）

## 使用

```bash
python hello.py
```

输出:
```
Hello, World!
```

## 扩展示例

```python
from hello import greet

print(greet("Alice"))          # Hello, Alice!
print(greet("Bob", "Hi"))      # Hi, Bob!
print(greet("Charlie", "Hey")) # Hey, Charlie!
```

## 许可证

MIT
