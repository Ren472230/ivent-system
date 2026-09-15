namespace Ivent {
  export function seededNext(seed: number): { seed: number; value: number } {
    let x = seed >>> 0;
    if (x === 0) x = 0x6d2b79f5;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const nextSeed = x >>> 0;
    return { seed: nextSeed, value: nextSeed / 0x100000000 };
  }
}
