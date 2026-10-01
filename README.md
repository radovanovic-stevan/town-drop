# Town Drop

A map quiz in the browser. A town name appears and you click the country it's in on the world map.

- 5 towns per game, 45 seconds each
- Correct answers score 100–1000 points depending on how fast you answer
- Clicking a country that borders the right one gets half points
- Every game has a seed: share it and the other person gets the same five towns
- The top 10 scores are saved in your browser

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8642
```

and go to http://localhost:8642/. An internet connection is needed for d3, topojson-client and the fonts, which load from CDNs.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The game |
| `towns.js` | 1,500 towns across 196 countries |
| `world.js` | Country shapes (Natural Earth 50m, via world-atlas) |
| `build-towns.js` | Script that generates `towns.js`; its header lists the source files it needs |

Seeds pick towns by their position in `towns.js`, so regenerating or editing the list changes what every seed produces.

## Data

- Country shapes: [Natural Earth](https://www.naturalearthdata.com/) (public domain), packaged by [world-atlas](https://github.com/topojson/world-atlas)
- Towns: Natural Earth populated places (public domain), plus [GeoNames](https://www.geonames.org/) (CC BY 4.0) for Nauru and Seychelles
