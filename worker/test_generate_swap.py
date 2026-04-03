#!/usr/bin/env python3
"""
End-to-end test for the 2-step pipeline: FLUX generation + FaceFusion face swap.

Run on the GPU pod:
    python test_generate_swap.py --face /path/to/your/face.jpg

This will:
  1. Generate a scene with FLUX (generic person, no identity)
  2. Swap your face onto the generated scene
  3. Save the result as test_output_swap.jpg
"""

import argparse
import os
import sys
import time


def main():
    parser = argparse.ArgumentParser(description="Test 2-step generate+swap pipeline")
    parser.add_argument("--face", required=True, help="Path to source face photo")
    parser.add_argument(
        "--prompt",
        default="raw candid photo of a person at a tropical beach, golden hour, "
                "natural sunlight, ocean waves in background, real skin texture with pores, "
                "85mm f/1.4 lens, film grain, unretouched, editorial photography",
        help="Scene prompt",
    )
    parser.add_argument("--output", default="test_output_swap.jpg", help="Output path")
    parser.add_argument("--steps", type=int, default=20, help="FLUX inference steps")
    parser.add_argument("--seed", type=int, default=42, help="Seed for reproducibility")
    args = parser.parse_args()

    if not os.path.isfile(args.face):
        print(f"ERROR: Face photo not found: {args.face}")
        sys.exit(1)

    print(f"\n{'='*60}")
    print("OnlyTwins 2-Step Pipeline Test")
    print(f"{'='*60}")
    print(f"  Source face: {args.face}")
    print(f"  Prompt:      {args.prompt[:70]}...")
    print(f"  Steps:       {args.steps}")
    print(f"  Seed:        {args.seed}")
    print(f"  Output:      {args.output}")
    print()

    from generate_swap import generate_and_swap

    t0 = time.time()
    result_path = generate_and_swap(
        source_face_path=args.face,
        prompt=args.prompt,
        output_path=args.output,
        steps=args.steps,
        seed=args.seed,
        upscale=False,
    )
    elapsed = round(time.time() - t0, 1)

    if os.path.isfile(result_path):
        size_kb = os.path.getsize(result_path) / 1024
        print(f"\n{'='*60}")
        print(f"SUCCESS — {result_path} ({size_kb:.0f} KB) in {elapsed}s")
        print(f"{'='*60}\n")
    else:
        print(f"\nFAILED — no output file produced after {elapsed}s")
        sys.exit(1)


if __name__ == "__main__":
    main()
