const hexColorPattern = /^#[0-9a-f]{6}$/i;

export function hexToRgb(color) {
  if (!hexColorPattern.test(color || "")) return [0, 0, 0];
  return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
}

export function colorHue(color) {
  const [red, green, blue] = hexToRgb(color).map((value) => value / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta === 0) return 0;
  let hue;
  if (maximum === red) hue = ((green - blue) / delta) % 6;
  else if (maximum === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return (hue * 60 + 360) % 360;
}

export function relativeLuminance(color) {
  const channels = hexToRgb(color).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function isHexColor(color) {
  return hexColorPattern.test(color || "");
}
