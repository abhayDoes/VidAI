from pydantic import BaseModel


class VideoResponse(BaseModel):
    id: int
    filename: str
    status: str

    model_config = {
        "from_attributes": True
    }