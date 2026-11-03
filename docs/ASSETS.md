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

Selection rule: everyday moments with several distinct things to tap, and no identifiable children (project consent rule).

## Generated audio

Phrase audio is synthesized at runtime with edge-tts (Microsoft neural voices) and cached in `backend/data/audio/`. Not committed.

## Brand

Logo mark (`frontend/public/logo-mark.svg`) drawn for this project during the hackathon.

Posters (`docs/brand/momentalk_poster_4x3.png`, `docs/brand/momentalk_poster_16x9.png`) are rendered from the app itself (`/?poster=4x3`, `/?poster=16x9`, see `frontend/src/pages/Poster.tsx`) using the Unsplash photos above. Re-render after the demo moments are outlined by SAM 3.1 so the outlines shown are real.
