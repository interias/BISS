from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

from app import images
from tests.factories import add_food


@pytest.fixture(autouse=True)
def images_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    directory = tmp_path / "images"
    directory.mkdir()
    monkeypatch.setenv("IMAGES_DIR", str(directory))
    return directory


def picture(size: tuple[int, int], fmt: str = "JPEG", mode: str = "RGB") -> bytes:
    out = BytesIO()
    # Half transparent where the mode has alpha, so the alpha channel is kept.
    Image.new(mode, size, (255, 165, 0, 128) if mode == "RGBA" else "orange").save(out, format=fmt)
    return out.getvalue()


def upload(client: TestClient, food_id: int, data: bytes, content_type: str = "image/jpeg"):
    files = {"file": ("photo", data, content_type)}
    return client.put(f"/api/v1/foods/{food_id}/image", files=files)


def stored(images_dir: Path, name: str) -> Image.Image:
    return Image.open(images_dir / name)


def test_jpeg_becomes_webp_with_longer_edge_512(
    client: TestClient, session: Session, images_dir: Path
) -> None:
    food = add_food(session, "Skyr")

    response = upload(client, food.id, picture((2000, 1500)))

    assert response.status_code == 200
    name = response.json()["image_path"]
    assert name.startswith(f"{food.id}-") and name.endswith(".webp")
    image = stored(images_dir, name)
    assert (image.format, image.size) == ("WEBP", (512, 384))
    assert client.get(f"/api/v1/foods/{food.id}").json()["image_path"] == name


def test_portrait_png_with_alpha_and_webp_are_accepted(
    client: TestClient, session: Session, images_dir: Path
) -> None:
    food = add_food(session, "Skyr")
    png = upload(client, food.id, picture((600, 1200), "PNG", "RGBA"), "image/png").json()
    image = stored(images_dir, png["image_path"])
    assert (image.size, image.mode) == ((256, 512), "RGBA")

    webp = upload(client, food.id, picture((1024, 1024), "WEBP"), "image/webp").json()
    assert stored(images_dir, webp["image_path"]).size == (512, 512)


def test_camera_jpeg_with_mpf_block_is_accepted(
    client: TestClient, session: Session, images_dir: Path
) -> None:
    food = add_food(session, "Skyr")
    out = BytesIO()
    frames = [Image.new("RGB", (1024, 768), color) for color in ("orange", "blue")]
    frames[0].save(out, format="MPO", save_all=True, append_images=frames[1:])

    name = upload(client, food.id, out.getvalue()).json()["image_path"]

    assert stored(images_dir, name).size == (512, 384)


def test_small_image_is_not_enlarged(
    client: TestClient, session: Session, images_dir: Path
) -> None:
    food = add_food(session, "Skyr")
    name = upload(client, food.id, picture((300, 200))).json()["image_path"]
    assert stored(images_dir, name).size == (300, 200)


def test_get_image_is_webp_and_cacheable(client: TestClient, session: Session) -> None:
    food = add_food(session, "Skyr")
    name = upload(client, food.id, picture((800, 600))).json()["image_path"]

    response = client.get(f"/api/v1/images/{name}")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/webp"
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert Image.open(BytesIO(response.content)).size == (512, 384)


def test_new_upload_replaces_the_old_file(
    client: TestClient, session: Session, images_dir: Path
) -> None:
    food = add_food(session, "Skyr")
    first = upload(client, food.id, picture((800, 600))).json()["image_path"]
    second = upload(client, food.id, picture((600, 800))).json()["image_path"]

    assert first != second
    assert [p.name for p in images_dir.iterdir()] == [second]
    assert client.get(f"/api/v1/images/{first}").status_code == 404


def test_format_is_checked_by_content(client: TestClient, session: Session) -> None:
    food = add_food(session, "Skyr")
    gif = upload(client, food.id, picture((100, 100), "GIF", "P"), "image/jpeg")
    assert gif.status_code == 422
    assert "GIF" in gif.json()["detail"]
    text = upload(client, food.id, b"not an image at all", "image/jpeg")
    assert text.status_code == 422
    truncated = upload(client, food.id, picture((800, 600))[:2000])
    assert truncated.status_code == 422
    assert client.get(f"/api/v1/foods/{food.id}").json()["image_path"] is None


def test_upload_over_10_mb_is_rejected(
    client: TestClient, session: Session, images_dir: Path
) -> None:
    food = add_food(session, "Skyr")
    # A valid JPEG padded past the limit: only the size can fail.
    data = picture((100, 100))
    data += b"\0" * (images.MAX_BYTES + 1 - len(data))

    response = upload(client, food.id, data)

    assert response.status_code == 422
    assert "10 MB" in response.json()["detail"]
    assert list(images_dir.iterdir()) == []


def test_decompression_bomb_is_rejected(
    client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    food = add_food(session, "Skyr")
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1000)
    assert upload(client, food.id, picture((100, 100))).status_code == 422


def test_unknown_food_is_404(client: TestClient) -> None:
    assert upload(client, 999999, picture((10, 10))).status_code == 404


def test_image_names_cannot_leave_the_directory(client: TestClient, images_dir: Path) -> None:
    (images_dir.parent / "secret.webp").write_bytes(b"secret")
    for name in ("..%2Fsecret.webp", "secret.webp", "1-0123456789abcdef.png", "1-zz.webp"):
        assert client.get(f"/api/v1/images/{name}").status_code == 404
    assert client.get("/api/v1/images/1-0123456789abcdef.webp").status_code == 404
