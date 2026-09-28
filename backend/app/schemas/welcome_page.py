"""Strict, text-only content blocks. Published pages never contain user HTML."""
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator


class Block(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")


class Heading(Block):
    type: Literal["heading"]
    text: str = Field(max_length=180)
    level: Literal[1, 2, 3] = 2


class Paragraph(Block):
    type: Literal["text"]
    text: str = Field(max_length=2000)


class Banner(Block):
    type: Literal["banner"]
    title: str = Field(max_length=180)
    body: str = Field(max_length=600)
    image_id: str | None = Field(default=None, pattern=r"^[0-9a-f]{32}$")


class ImageBlock(Block):
    type: Literal["image"]
    image_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    caption: str = Field(default="", max_length=300)
    alt: str = Field(min_length=1, max_length=180)


class Metrics(Block):
    type: Literal["metrics"]


class Table(Block):
    type: Literal["table"]
    title: str = Field(max_length=180)
    columns: list[str] = Field(min_length=2, max_length=6)
    rows: list[list[str]] = Field(max_length=30)

    @model_validator(mode="after")
    def valid_cells(self):
        if any(len(cell) > 120 for cell in self.columns):
            raise ValueError("Table headings are too long")
        if any(len(row) != len(self.columns) or any(len(cell) > 300 for cell in row) for row in self.rows):
            raise ValueError("Table row width or cell length is invalid")
        return self


class ChartPoint(BaseModel):
    label: str = Field(max_length=80)
    value: float = Field(ge=-1e9, le=1e9, allow_inf_nan=False)


class Chart(Block):
    type: Literal["chart"]
    title: str = Field(max_length=180)
    unit: str = Field(default="", max_length=40)
    style: Literal["line", "bar"] = "line"
    points: list[ChartPoint] = Field(min_length=2, max_length=30)


class Research(Block):
    type: Literal["research"]
    title: str = Field(max_length=180)
    value: str = Field(max_length=80)
    unit: str = Field(default="", max_length=40)
    source: str = Field(default="", max_length=240)


WelcomeBlock = Annotated[
    Heading | Paragraph | Banner | ImageBlock | Metrics | Table | Chart | Research,
    Field(discriminator="type"),
]


class WelcomeDraft(BaseModel):
    revision: int = Field(ge=0)
    blocks: list[WelcomeBlock] = Field(max_length=30)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [block.id for block in self.blocks]
        if len(ids) != len(set(ids)):
            raise ValueError("Block IDs must be unique")
        return self


class WelcomePublish(BaseModel):
    revision: int = Field(ge=0)
