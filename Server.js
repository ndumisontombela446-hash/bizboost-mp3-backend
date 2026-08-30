const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID;


app.get("/", (req, res) => {

  res.json({
    app: "BizBoost MP3",
    status: "online"
  });

});


app.get("/api/search", async (req, res) => {

  try {

    const query = String(req.query.q || "").trim();

    if (!query) {

      return res.status(400).json({
        error: "Search query is required"
      });

    }


    const url =
      "https://api.jamendo.com/v3.0/tracks/" +
      "?client_id=" +
      encodeURIComponent(JAMENDO_CLIENT_ID) +
      "&format=json" +
      "&limit=15" +
      "&namesearch=" +
      encodeURIComponent(query) +
      "&audioformat=mp32" +
      "&audiodlformat=mp32";


    const response = await fetch(url);


    if (!response.ok) {

      return res.status(502).json({
        error: "Jamendo API request failed"
      });

    }


    const data = await response.json();


    const tracks = (data.results || []).map(track => ({

      id: track.id,

      name: track.name,

      artist: track.artist_name,

      image: track.image || track.album_image || "",

      audio: track.audio || "",

      download:
        track.audiodownload_allowed
          ? (track.audiodownload || "")
          : "",

      downloadAllowed:
        Boolean(track.audiodownload_allowed)

    }));


    res.json({
      success: true,
      count: tracks.length,
      results: tracks
    });


  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Server error"
    });

  }

});


app.listen(PORT, () => {

  console.log(
    `BizBoost MP3 backend running on port ${PORT}`
  );

});
