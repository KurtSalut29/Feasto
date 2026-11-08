/**
 * A Code 39 barcode, the kind printed on store receipts. Any barcode scanner reads it back as
 * the same text. Code 39 writes each character as 5 bars and 4 gaps, 3 of them wide ("1" below),
 * between "*" start and stop marks.
 */
const CODE39: Record<string, string> = {
  "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000", "4": "000110001",
  "5": "100110000", "6": "001110000", "7": "000100101", "8": "100100100", "9": "001100100",
  A: "100001001", B: "001001001", C: "101001000", D: "000011001", E: "100011000",
  F: "001011000", G: "000001101", H: "100001100", I: "001001100", J: "000011100",
  K: "100000011", L: "001000011", M: "101000010", N: "000010011", O: "100010010",
  P: "001010010", Q: "000000111", R: "100000110", S: "001000110", T: "000010110",
  U: "110000001", V: "011000001", W: "111000000", X: "010010001", Y: "110010000",
  Z: "011010000", "-": "010000101", "*": "010010100",
};

const NARROW = 1;
const WIDE = 3;

/** Bars as [x, width] pairs, plus the total width. */
export function code39(text: string) {
  const chars = `*${text.toUpperCase().replace(/[^0-9A-Z-]/g, "")}*`;
  const bars: [number, number][] = [];
  let x = 0;
  for (const char of chars) {
    const pattern = CODE39[char];
    for (let i = 0; i < 9; i++) {
      const width = pattern[i] === "1" ? WIDE : NARROW;
      if (i % 2 === 0) bars.push([x, width]);
      x += width;
    }
    x += NARROW; // the gap between characters
  }
  return { bars, width: x - NARROW };
}

export function Barcode({ value, className = "" }: { value: string; className?: string }) {
  const { bars, width } = code39(value);
  const quiet = 10;
  return (
    <svg
      viewBox={`${-quiet} 0 ${width + quiet * 2} 40`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`Barcode for ${value}`}
      shapeRendering="crispEdges"
    >
      {bars.map(([x, w]) => (
        <rect key={x} x={x} y={0} width={w} height={40} fill="currentColor" />
      ))}
    </svg>
  );
}
