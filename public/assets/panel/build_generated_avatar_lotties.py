"""Build high-quality Neha and Vikram Lotties from generated sprite sheets."""

from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance


ROOT = Path(__file__).resolve().parent
GENERATED = ROOT / "generated"
STILLS = ROOT / "stills"


def crop_frames(sheet_path: Path, boxes: list[tuple[int, int, int, int]]) -> list[Image.Image]:
    sheet = Image.open(sheet_path).convert("RGB")
    frames = []
    for box in boxes:
        frame = sheet.crop(box).resize((1024, 1024), Image.Resampling.LANCZOS)
        frame = ImageEnhance.Sharpness(frame).enhance(1.08)
        frames.append(frame.convert("RGBA"))
    return frames


def mask(size: tuple[int, int], ellipses: list[tuple[int, int, int, int]], blur: int) -> Image.Image:
    result = Image.new("L", size, 0)
    draw = ImageDraw.Draw(result)
    for bounds in ellipses:
        draw.ellipse(bounds, fill=255)
    return result.filter(ImageFilter.GaussianBlur(blur))


def merge_region(base: Image.Image, pose: Image.Image, areas: list[tuple[int, int, int, int]], blur: int) -> Image.Image:
    overlay = pose.copy()
    overlay.putalpha(mask(base.size, areas, blur))
    return Image.alpha_composite(base, overlay)


def transparent_region(pose: Image.Image, areas: list[tuple[int, int, int, int]], blur: int) -> Image.Image:
    result = pose.copy()
    result.putalpha(mask(result.size, areas, blur))
    return result


def png_data(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, "PNG", optimize=True)
    return output.getvalue()


def layer(name: str, ref_id: str, start: int, end: int, index: int) -> dict:
    return {
        "ty": 2,
        "nm": name,
        "sr": 1,
        "st": start,
        "op": end,
        "ip": start,
        "hd": False,
        "ddd": 0,
        "bm": 0,
        "hasMask": False,
        "ao": 0,
        "ks": {
            "a": {"a": 0, "k": [512, 512]},
            "s": {"a": 0, "k": [50, 50]},
            "sk": {"a": 0, "k": 0},
            "p": {"a": 0, "k": [256, 256]},
            "r": {"a": 0, "k": 0},
            "sa": {"a": 0, "k": 0},
            "o": {"a": 0, "k": 100},
        },
        "refId": ref_id,
        "ind": index,
    }


def build_lottie(path: Path, frames: dict[str, Image.Image]) -> None:
    sequence = [
        ("idle", 0, 25), ("blink", 25, 29), ("idle", 29, 60),
        ("talk-small", 60, 68), ("talk-medium", 68, 76),
        ("talk-wide", 76, 84), ("talk-medium", 84, 92),
        ("talk-small", 92, 100), ("talk-medium", 100, 108),
        ("talk-wide", 108, 116), ("talk-small", 116, 120),
    ]
    assets = [
        {"id": key, "e": 0, "w": 1024, "h": 1024, "p": f"{key}.png", "u": "/i/"}
        for key in frames
    ]
    animation = {
        "nm": "Main Scene", "ddd": 0, "h": 512, "w": 512,
        "meta": {"g": "VoiceDot AI consistent avatar builder"},
        "layers": [layer(name, name, start, end, i + 1) for i, (name, start, end) in enumerate(sequence)],
        "v": "5.7.0", "fr": 30, "op": 120, "ip": 0, "assets": assets,
        "markers": [{"cm": "idle", "tm": 0, "dr": 60}, {"cm": "talking", "tm": 60, "dr": 60}],
    }
    state_machine = {
        "initial": "GLOBAL STATE",
        "states": [
            {"name": "GLOBAL STATE", "animation": "", "type": "GlobalState", "transitions": [
                {"guards": [], "toState": "idle", "type": "Transition"},
                {"guards": [{"inputName": "talking", "type": "Boolean", "compareTo": True, "conditionType": "Equal"}], "toState": "talking", "type": "Transition"},
            ]},
            {"name": "idle", "animation": "", "type": "PlaybackState", "transitions": [], "segment": "idle", "autoplay": True, "speed": 1, "loop": True},
            {"name": "talking", "animation": "", "type": "PlaybackState", "transitions": [], "segment": "talking", "autoplay": True, "speed": 1, "loop": True},
        ],
        "inputs": [{"name": "talking", "type": "Boolean", "value": False}],
        "interactions": [],
    }
    manifest = {
        "version": "2", "generator": "VoiceDot AI",
        "animations": [{"id": "Main Scene"}],
        "stateMachines": [{"id": "StateMachine1", "name": "StateMachine1"}],
    }
    with ZipFile(path, "w", ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, separators=(",", ":")))
        archive.writestr("a/Main Scene.json", json.dumps(animation, separators=(",", ":")))
        archive.writestr("s/StateMachine1.json", json.dumps(state_machine, separators=(",", ":")))
        for name, image in frames.items():
            archive.writestr(f"i/{name}.png", png_data(image))


def save_character(
    prefix: str,
    source_frames: list[Image.Image],
    eye_areas: list[tuple[int, int, int, int]],
    mouth_areas: list[tuple[int, int, int, int]],
) -> dict[str, Image.Image]:
    base = source_frames[0]
    frames = {
        "idle": base,
        "blink": merge_region(base, source_frames[1], eye_areas, 9),
        "talk-small": merge_region(base, source_frames[2], mouth_areas, 12),
        "talk-medium": merge_region(base, source_frames[3], mouth_areas, 12),
        "talk-wide": merge_region(base, source_frames[4], mouth_areas, 12),
    }
    for state, image in frames.items():
        image.save(STILLS / f"{prefix}-v2-{state}.png", "PNG", optimize=True)
    for state in ("talk-small", "talk-medium", "talk-wide"):
        transparent_region(frames[state], mouth_areas, 12).save(
            STILLS / f"{prefix}-v2-mouth-{state.removeprefix('talk-')}.png", "PNG", optimize=True
        )
    return frames


def main() -> None:
    STILLS.mkdir(parents=True, exist_ok=True)
    neha = crop_frames(
        GENERATED / "neha-sprite-sheet.png",
        [(2, 2, 510, 510), (514, 2, 1022, 510), (1026, 2, 1534, 510), (2, 514, 510, 1022), (514, 514, 1022, 1022)],
    )
    vikram = crop_frames(
        GENERATED / "vikram-sprite-sheet.png",
        [(16, 18, 506, 508), (522, 18, 1012, 508), (1029, 18, 1519, 508), (16, 519, 506, 1009), (522, 519, 1012, 1009)],
    )
    neha_frames = save_character(
        "neha", neha,
        [(332, 306, 485, 418), (539, 306, 692, 418)],
        [(425, 438, 605, 570)],
    )
    vikram_frames = save_character(
        "vikram", vikram,
        [(326, 287, 486, 401), (538, 287, 698, 401)],
        [(430, 422, 592, 552)],
    )
    build_lottie(ROOT / "neha-high-quality.lottie", neha_frames)
    build_lottie(ROOT / "vikram-high-quality.lottie", vikram_frames)
    print("Built Neha and Vikram high-quality Lottie packages")


if __name__ == "__main__":
    main()
