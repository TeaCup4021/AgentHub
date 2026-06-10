from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from typing import TypeVar, Generic, List

T = TypeVar("T")

class BaseSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )

class Page(BaseSchema, Generic[T]):
    list: List[T]
    total: int
    page: int
    page_size: int
