"""Strict, text-only content blocks. Published pages never contain user HTML."""
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator


class Block(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")


class Eyebrow(Block):
    type: Literal["eyebrow"]
    text: str = Field(max_length=180)


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


class MetricTrend(BaseModel):
    metric: str = Field(max_length=100, pattern=r"^[a-zA-Z0-9_.-]*$")
    axis: Literal["month", "test"] = "month"
    statistic: Literal["mean", "median"] = "mean"


class Metrics(Block):
    type: Literal["metrics"]
    items: list[Literal["participants", "measurements", "active_tests"]] = Field(default_factory=lambda: ["participants", "measurements", "active_tests"], max_length=3)
    trends: list[MetricTrend] = Field(default_factory=list, max_length=4)


class DataChart(Block):
    type: Literal["data_chart"]
    title: str = Field(max_length=180)
    metric: str = Field(max_length=100, pattern=r"^[a-zA-Z0-9_.-]*$")
    axis: Literal["month", "test"] = "month"
    statistic: Literal["mean", "median"] = "mean"
    style: Literal["line", "bar"] = "line"


class Histogram(Block):
    type: Literal["histogram"]
    title: str = Field(max_length=180)
    metric: str = Field(max_length=100, pattern=r"^[a-zA-Z0-9_.-]*$")
    bins: int = Field(default=8, ge=3, le=20)
    test_definition_id: str | None = Field(default=None, max_length=64)


class AverageResponse(Block):
    type: Literal["average_response"]
    title: str = Field(max_length=180)
    test_definition_id: str = Field(max_length=64)
    channel: Literal["LX", "LY", "RX", "RY"] = "LX"


class DataTable(Block):
    type: Literal["data_table"]
    title: str = Field(max_length=180)
    metrics: list[str] = Field(max_length=8)
    axis: Literal["month", "test"] = "month"
    statistic: Literal["mean", "median"] = "mean"

    @model_validator(mode="after")
    def valid_metric_keys(self):
        if any(len(key) > 100 or not all(char.isalnum() or char in "_.-" for char in key) for key in self.metrics):
            raise ValueError("Invalid metric key")
        if len(set(self.metrics)) != len(self.metrics):
            raise ValueError("Metric keys must be unique")
        return self


class Paper(Block):
    type: Literal["paper"]
    title: str = Field(min_length=1, max_length=500)
    authors: list[str] = Field(min_length=1, max_length=30)
    journal: str = Field(default="", max_length=240)
    publisher: str = Field(default="", max_length=240)
    year: int | None = Field(default=None, ge=1600, le=2200)
    volume: str = Field(default="", max_length=60)
    issue: str = Field(default="", max_length=60)
    pages: str = Field(default="", max_length=80)
    doi: str = Field(default="", max_length=180)
    url: str = Field(default="", max_length=500)
    abstract: str = Field(default="", max_length=3000)


WelcomeBlock = Annotated[
    Eyebrow | Heading | Paragraph | Banner | ImageBlock | Metrics | DataChart | DataTable | Histogram | AverageResponse | Paper,
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
