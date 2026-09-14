from pathlib import Path

from PIL import Image


STILLS = Path(__file__).resolve().parent / "stills"

# Integer translations align the complete authored portrait frames to each
# avatar's idle frame. Nothing is cropped, composited, regenerated, or warped.
FRAME_TRANSFORMS = {
    "sales-frame-idle.png": ("sales-aligned-idle.png", 1.0, 0, 0),
    "sales-frame-blink.png": ("sales-aligned-blink.png", 1.0, -2, 1),
    "sales-frame-talk-1.png": ("sales-aligned-talk-1.png", 1.0, -4, -1),
    "ceo-frame-idle.png": ("ceo-aligned-idle.png", 1.0, 0, 0),
    "ceo-frame-blink.png": ("ceo-aligned-blink.png", 1.0, 0, 0),
    # Vikram's authored talking portraits are approximately 2% smaller than
    # his idle portrait. Scale and translate the complete frame as one unit.
    "ceo-frame-talk-1.png": ("ceo-aligned-talk-1.png", 1.02, 15, 0),
    "ceo-frame-talk-2.png": ("ceo-aligned-talk-2.png", 1.02, 15, 0),
}


def align_full_frame(
    source_path: Path, output_path: Path, scale: float, dx: int, dy: int
) -> None:
    with Image.open(source_path) as source:
        # Lottie raster assets may be palette-indexed. Convert before creating
        # the translated canvas so the source palette and colours are retained.
        source_rgb = source.convert("RGB")
        width, height = source_rgb.size
        scaled_size = (round(width * scale), round(height * scale))
        aligned = source_rgb.resize(scaled_size, Image.Resampling.LANCZOS)
        output = Image.new("RGB", source_rgb.size, (255, 255, 255))
        x = (width - scaled_size[0]) // 2 + dx
        y = (height - scaled_size[1]) // 2 + dy
        output.paste(aligned, (x, y))
        output.save(output_path, format="PNG", optimize=True)


for source_name, (output_name, scale, dx, dy) in FRAME_TRANSFORMS.items():
    align_full_frame(STILLS / source_name, STILLS / output_name, scale, dx, dy)
    print(f"{output_name}: full-frame scale {scale:.2f}, translation ({dx:+d}, {dy:+d})")
