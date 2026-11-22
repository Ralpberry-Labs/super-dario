# Super Dario

A small, original retro platformer that runs in the browser. Run, jump, stomp bugs, and climb starburst-block towers across three levels.

**Play it:** https://ralpberry-labs.github.io/super-dario/

![Super Dario](assets/dario-win.png)

## Controls

| Action | Keyboard | Phone |
|---|---|---|
| Move | Arrows / A D | ◀ ▶ |
| Jump (hold for higher) | Z / Space / Up | ▲ |
| Run, and throw sparks once powered up | X / Shift | ✱ |
| Crouch | Down / S | |
| Pause / Mute | P / M | |
| Record gameplay with sound | R or the **● Record** button | ● Record |

## How it plays

- Starburst blocks with a gold shimmer can be hit from below. They give a token, a spark power-up, or an extra life. Plain starburst boxes are terrain you climb.
- The spark power-up lets you throw sparks and smash bricks. If you get hit while powered up, you lose the power instead of a life.
- Stomping enemies one after another earns more points each time, and a chain of 8 gives an extra life. Every 50 tokens also gives an extra life.
- Your best time for each level and your best score are saved in your browser.
- The recorder saves an MP4 (or WebM) of the game screen and its sound.

Levels: **1-1 Hello, World** · **1-2 Context Climb** · **1-3 Scaling Laws**

## Run locally

No build step and no dependencies:

```bash
python3 -m http.server 8737
# open http://localhost:8737
```

## How it's made

- `game.js`: the whole game, written with plain Canvas 2D. Music and sound effects are synthesized live with WebAudio, so there are no audio files.
- `assets/`: pixel-art sprites, tiles and background, generated with an image model and then cleaned up.
- `tools/process.py`: the cleanup script (requires Pillow and NumPy). It removes the white background, trims each image and scales it. It reads source images from a local `raw/` folder, which isn't included in this repo.

## Disclaimer

This is a fan-made parody. It isn't affiliated with or endorsed by any company or person it may resemble.

## License

[MIT](LICENSE) © Ralpberry Labs
