"""Rebuild the Sales and CEO raster-pose Lotties with registered faces.

The source packages swap complete 1024px portraits for blink/talking states.
This utility keeps one neutral portrait as the base and composites only the
eyes or mouth from each alternate pose, so the head never moves between
frames. Run from any directory; paths are resolved relative to this file.
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image, ImageDraw, ImageFilter


PANEL_DIR = Path(__file__).resolve().parent
STILLS_DIR = PANEL_DIR / "stills"
SOURCE_DIR = Path.home() / "Downloads" / "animations-main" / "animations-main"


def feathered_mask(size: tuple[int, int], ellipses: list[tuple[int, int, int, int]], blur: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for bounds in ellipses:
        draw.ellipse(bounds, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(blur))


def region_pose(
    base: Image.Image,
    pose: Image.Image,
    *,
    offset: tuple[int, int],
    ellipses: list[tuple[int, int, int, int]],
    blur: int,
) -> Image.Image:
    registered = Image.new("RGBA", base.size, (0, 0, 0, 0))
    registered.alpha_composite(pose.convert("RGBA"), offset)
    registered.putalpha(feathered_mask(base.size, ellipses, blur))
    return Image.alpha_composite(base.convert("RGBA"), registered)


def transparent_region(image: Image.Image, ellipses: list[tuple[int, int, int, int]], blur: int) -> Image.Image:
    result = image.convert("RGBA").copy()
    result.putalpha(feathered_mask(result.size, ellipses, blur))
    return result


def png_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def rebuild_package(source: Path, destination: Path, replacements: dict[str, Image.Image]) -> None:
    with ZipFile(source, "r") as archive:
        entries = [(info, archive.read(info.filename)) for info in archive.infolist()]
    with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for info, original in entries:
            archive.writestr(info, png_bytes(replacements[info.filename]) if info.filename in replacements else original)


def load_zip_image(package: Path, name: str) -> Image.Image:
    with ZipFile(package, "r") as archive:
        return Image.open(BytesIO(archive.read(name))).convert("RGBA")


def save_still(image: Image.Image, name: str) -> None:
    image.save(STILLS_DIR / name, format="PNG", optimize=True)


def rebuild_sales() -> None:
    source = SOURCE_DIR / "sales.lottie"
    names = {
        "idle": "i/idle1 (1)_ca1d91fd-66a1-4b24-8050-8f3cc87fd4c3.png",
        "blink": "i/idle2 (1)_c314177d-af28-4866-87db-104bb4dcbb03.png",
        "talk1": "i/talking1_0485a699-9a4c-470a-a8f3-42556857389d.png",
        "talk2": "i/talking2_5e7d8da7-7627-4582-973c-c48d63f44576.png",
        "hover": "i/hover (1)_68afb71a-063d-48b6-b262-526c7ed47f01.png",
    }
    raw = {key: load_zip_image(source, value) for key, value in names.items()}
    base = raw["idle"]
    eyes = [(382, 318, 493, 391), (526, 318, 637, 391)]
    mouth = [(411, 441, 615, 535)]
    blink = region_pose(base, raw["blink"], offset=(0, 0), ellipses=eyes, blur=7)
    # The source talking mouths sit about three pixels to the right of the
    # neutral lip centre. Register them one pixel left before compositing.
    talk1 = region_pose(base, raw["talk1"], offset=(-1, -11), ellipses=mouth, blur=10)
    talk2 = region_pose(base, raw["talk2"], offset=(-1, -12), ellipses=mouth, blur=10)
    replacements = {
        names["idle"]: base,
        names["blink"]: blink,
        names["talk1"]: talk1,
        names["talk2"]: talk2,
        names["hover"]: base,
    }
    corrected = PANEL_DIR / "sales.lottie"
    rebuild_package(source, corrected, replacements)
    (PANEL_DIR / "industry-general.lottie").write_bytes(corrected.read_bytes())
    save_still(base, "industry-idle.png")
    save_still(blink, "industry-blink.png")
    save_still(talk1, "industry-talking-1.png")
    save_still(talk2, "industry-talking-2.png")
    save_still(transparent_region(talk1, mouth, 10), "industry-mouth-aligned.png")


def rebuild_ceo() -> None:
    source = SOURCE_DIR / "ceo.lottie"
    names = {
        "idle": "i/idle1_6b42b621-4d8b-4686-8a71-16c47a249931.png",
        "blink": "i/idle2_6dee73c8-087a-4582-8d22-7d1086628e39.png",
        "talk1": "i/talking1_eb192f4e-d496-4dee-8a79-48b45bc79d26.png",
        "talk2": "i/talking2_aac00bc3-74b2-41a5-8187-26633b4bc15e.png",
        "talk3": "i/talking3_482b9c3d-512e-480d-a5aa-ed4d124a429e.png",
        "hover": "i/hover_08c7556a-9eb5-4cd2-b035-0eef2ecc24ac.png",
    }
    raw = {key: load_zip_image(source, value) for key, value in names.items()}
    base = raw["idle"]
    eyes = [(388, 303, 488, 372), (516, 303, 616, 372)]
    mouth = [(415, 421, 586, 505)]
    blink = region_pose(base, raw["blink"], offset=(0, 0), ellipses=eyes, blur=7)
    talk1 = region_pose(base, raw["talk1"], offset=(3, -13), ellipses=mouth, blur=9)
    talk2 = region_pose(base, raw["talk2"], offset=(3, -17), ellipses=mouth, blur=9)
    talk3 = region_pose(base, raw["talk3"], offset=(3, -17), ellipses=mouth, blur=9)
    replacements = {
        names["idle"]: base,
        names["blink"]: blink,
        names["talk1"]: talk1,
        names["talk2"]: talk2,
        names["talk3"]: talk3,
        names["hover"]: base,
    }
    corrected = PANEL_DIR / "ceo.lottie"
    rebuild_package(source, corrected, replacements)
    (PANEL_DIR / "manager-ceo.lottie").write_bytes(corrected.read_bytes())
    save_still(base, "manager-idle.png")
    save_still(blink, "manager-blink.png")
    save_still(talk1, "manager-talking-1.png")
    save_still(talk2, "manager-talking-2.png")
    save_still(talk3, "manager-talking-3.png")
    save_still(transparent_region(talk2, mouth, 9), "manager-mouth-aligned.png")


if __name__ == "__main__":
    STILLS_DIR.mkdir(parents=True, exist_ok=True)
    rebuild_sales()
    rebuild_ceo()
    print("Rebuilt corrected sales.lottie and ceo.lottie")
