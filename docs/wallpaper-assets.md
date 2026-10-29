# Wallpaper assets

This collection contains **24 distinct generated nature and travel illustrations**.
They use hand-painted game environment art. They are not real travel photos.

Each scene was made with the OpenAI built-in image_gen tool. Exact prompts and
per-scene generation methods are in `wallpaper-prompts.json`. Scene 01 is the
painted edit of a generated draft; the photographic draft is not included.

The delivered files use JPEG quality 90 with optimized progressive encoding.
Conversion preserved source dimensions, color, and composition. No image was
cropped, resized, or reused as another scene. Original sources were not changed.
All 24 final JPEGs were fully decoded with Pillow 13.0.0.

Total asset size: **9,632,157 bytes**. Each file is below 1,500,000 bytes;
the total is below the 24,000,000-byte budget. Dimensions are near 16:9.

Run `node scripts/check-wallpapers.cjs` for the release gate. It requires exactly
24 entries and checks safe paths, file inventory, links, JPEG headers, dimensions,
hashes, and size. Scenes 18 through 24 were generated as seven separate new images;
the first 17 JPEG files and their manifest entries are unchanged.

| File in `app/wallpapers/` | Dimensions | Bytes | SHA256 |
| --- | --- | ---: | --- |
| 01-dolomites.jpg | 1672 x 941 | 443738 | `b91f26093a982cbe75d0532e57f470e01c4cf1980e8d71181bb6bb88fe382628` |
| 02-fjord.jpg | 1672 x 941 | 403274 | `646e48ec4c621a62fb3da3c5d4644c01be04e41d0b96c7d0a814f07b096b9eb6` |
| 03-bamboo.jpg | 1672 x 941 | 525929 | `e8a2dae37591c2f52534e6426b6252666f918630cfd01f4fc66f9c2fd80240b1` |
| 04-iceland.jpg | 1672 x 941 | 334679 | `00f646cb65f8569bf973b46b50cfd5e107fe6e6d56d108a66e400bd1e05c8f17` |
| 05-patagonia.jpg | 1672 x 941 | 405109 | `16b53d551a74da0c81a9d516c02eebdf9c40351264340d004d5ee514fed35a9b` |
| 06-alpine-meadow.jpg | 1672 x 941 | 430752 | `534c4462987be5f6f3cba4787923fdf00c2051dd1dcc7b22f554648bfb23dc87` |
| 07-namib.jpg | 1672 x 941 | 300485 | `de41da6a94036ac7e011ec22ea082c0de8e22adfff709a093998be36339d5e2f` |
| 08-milford.jpg | 1672 x 941 | 370940 | `e00e961f712d89fa805eb2103a9d30cd627d2815fc8abfac94fcdbf383c83f44` |
| 09-amalfi.jpg | 1672 x 941 | 460664 | `e6ad55a911989de945b7555569f258f3aba9bca2463a495268902c974ff7e2b8` |
| 10-rockies.jpg | 1672 x 940 | 443548 | `2746a66d391c2e5bdf76b3331fcdecce4451c3def6f391801618e47b140d5896` |
| 11-sonoran.jpg | 1672 x 941 | 391056 | `5d51b7ad121895a83e6b97fd2124d96d4a65ef5d50f055876fc8398f53aa47f8` |
| 12-skye.jpg | 1672 x 941 | 359832 | `66e13d01b5f879e01447145b2363d842ffee01b563e3547a417e297fcc5b4e4f` |
| 13-bali.jpg | 1672 x 941 | 421847 | `d53536e12bb2d53c0a376b61f2a3d3419b914b1fa39adbe11b02daffe12dab8e` |
| 14-faroe.jpg | 1672 x 941 | 365190 | `f0ce190a924d8ea7c17b5333a96b88e95a46a84ddc63ccb79d904f279cff3c69` |
| 15-cyclades.jpg | 1672 x 941 | 495059 | `c3741cc06fdef1a90e66b6d9f1769aa0b81156652a9df19dd16cb08d6f72c08c` |
| 16-oregon.jpg | 1672 x 941 | 300768 | `64f77090f2ea97c8a5151109c634407ba7806c19e8f06bb1bbdd64a28a71f111` |
| 17-fuji.jpg | 1672 x 941 | 392357 | `3295d69611eaeeb34f8bbf99efe0908acf33646c6a48d285b0788e061b7840d1` |
| 18-atlas.jpg | 1672 x 941 | 343933 | `0e23d4d4a961d87a6c075403c8f31cb3378dc67512f66b4db98a0642526da75e` |
| 19-bled.jpg | 1672 x 941 | 426299 | `cb6f5bb8358c1bdab3e1847b3cf4a4d4ca970f361c8799300a93c8533c9f286e` |
| 20-bhutan.jpg | 1672 x 941 | 412163 | `eb99ab0f127528cad540376d90a4940b30a9faa47a50651d744faac33ae37e91` |
| 21-tuscany.jpg | 1672 x 941 | 363719 | `3b61e9ff33efcb49098765a7daa2d7c6cf381e3bec72f4a23dd019cdf3ba7a8c` |
| 22-lapland.jpg | 1672 x 941 | 329497 | `df428e823dc2f70b3427ab9a16baf153dd5de7cd0b4f0609e7d746ce9e85e23e` |
| 23-great-ocean-road.jpg | 1672 x 941 | 469029 | `52d4d31149371c0613fa29f566bb5adf71d836d86d537faa45ca808ee07b5a37` |
| 24-kauai.jpg | 1672 x 941 | 442290 | `41ceb31d7242941794b8db7a66f10bb14c0c5107b4bbbf5600d84f97c7cc896d` |
