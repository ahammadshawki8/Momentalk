# Assets

Every photo, video, and audio file used by Momentalk, with its source and license.

## Demo photos (`demo-assets/unsplash/`)

All from Unsplash under the [Unsplash License](https://unsplash.com/license): free to use, including commercially, no permission needed. Photographer credit given below.

| File | Moment | Unsplash page | Photographer |
|---|---|---|---|
| `park.jpg` | Park | https://unsplash.com/photos/two-dogs-playing-with-a-red-ball-in-a-park-ETlT9e9Cujo | [@si1og](https://unsplash.com/@si1og) |
| `toys.jpg` | Toy box | https://unsplash.com/photos/multicolored-learning-toys-gDiRwIYAMA8 | [@vbcreative](https://unsplash.com/@vbcreative) |
| `birthday.jpg` | Birthday | https://unsplash.com/photos/happy-birthday-cake-with-candles-Z30Jpgmx2UY | [@imants72](https://unsplash.com/@imants72) |
| `nana.jpg` | Nana | https://unsplash.com/photos/an-old-woman-giving-a-thumbs-up-sign-pri_qdvCxTc | [@koflights](https://unsplash.com/@koflights) |
| `breakfast.jpg` | Breakfast | https://unsplash.com/photos/a-plate-of-food-with-a-fork-and-a-book-KLnYRJEgC6s | [@_carolineattwood](https://unsplash.com/@_carolineattwood) |
| `inbox_baking.jpg` | Agent inbox: baking | https://unsplash.com/photos/person-holding-rolling-pin--DesRxj28Ns | [@karishea](https://unsplash.com/@karishea) |
| `inbox_duck.jpg` | Agent inbox: bath duck | https://unsplash.com/photos/yellow-rubber-duck-on-red-textile-d5sK_-sVFSA | [@jannerboy62](https://unsplash.com/@jannerboy62) |
| `inbox_yellow_toys.jpg` | Agent inbox: yellow toys | https://unsplash.com/photos/yellow-ukulele-cars-emoji-plush-toy-on-white-surface-X1gTLgWMDKg | [@vbcreative](https://unsplash.com/@vbcreative) |

Selection rule: everyday moments with several distinct things to tap, and no identifiable children (project consent rule).

## Stock video (`demo-assets/stock/`)

| File | Use | Source | Creator | License |
|---|---|---|---|---|
| `park_dog.mp4` | Talking video scene "Fetch with Biscuit" | https://www.pexels.com/video/playful-dog-chasing-ball-in-lush-park-38356489/ | Yesim G. Ozdemir | Pexels License |

## Generated images (Muse Image)

- Avatars (`backend/data/avatars/`, the sample one ships in `deploy/seed-data/avatars/`): illustrated characters drawn by Muse Image from a text description of traits only. No photo of any person is used.
- Wish scenes: Muse Image adds the illustrated avatar into one of the Unsplash photos above. The place photo is the only real image sent.

## Screenshots

`docs/screens/` are screenshots of the app itself, showing only the Unsplash and Pexels media above and Muse Image illustrations.

## Generated audio

Phrase audio is synthesized at runtime with edge-tts (Microsoft neural voices) and cached in `backend/data/audio/`. Not committed.

## Brand

Logo mark (`frontend/public/logo-mark.svg`) drawn for this project during the hackathon.

Posters (`docs/brand/momentalk_poster_4x3.png`, `docs/brand/momentalk_poster_16x9.png`) are rendered from the app itself (`/?poster=4x3`, `/?poster=16x9`, see `frontend/src/pages/Poster.tsx`) using the Unsplash photos above. Re-render after the demo moments are outlined by SAM 3.1 so the outlines shown are real.
