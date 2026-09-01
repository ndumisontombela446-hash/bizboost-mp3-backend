const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* ================================
   JAMENDO
================================ */

const JAMENDO_CLIENT_ID =
  process.env.JAMENDO_CLIENT_ID || "e55a41dd";


/* ================================
   PAYSTACK
================================ */

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY;

const PAYSTACK_PLAN_CODE =
  process.env.PAYSTACK_PLAN_CODE;


/* ================================
   HOME
================================ */

app.get("/", (req, res) => {

  res.json({
    app: "BizBoost MP3",
    status: "online",
    payments: PAYSTACK_SECRET_KEY
      ? "configured"
      : "not configured"
  });

});


/* ================================
   MUSIC SEARCH
================================ */

app.get("/api/search", async (req, res) => {

  try {

    const query =
      String(req.query.q || "").trim();

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


    const response =
      await fetch(url);


    if (!response.ok) {

      return res.status(502).json({
        error: "Jamendo API request failed"
      });

    }


    const data =
      await response.json();


    const tracks =
      (data.results || []).map(track => ({

        id: track.id,

        name: track.name,

        artist: track.artist_name,

        image:
          track.image ||
          track.album_image ||
          "",

        audio:
          track.audio ||
          "",

        download:
          track.audiodownload_allowed
            ? (track.audiodownload || "")
            : "",

        downloadAllowed:
          Boolean(
            track.audiodownload_allowed
          )

      }));


    res.json({

      success: true,

      count: tracks.length,

      results: tracks

    });


  } catch (error) {

    console.error(
      "Search error:",
      error
    );

    res.status(500).json({
      error: "Server error"
    });

  }

});


/* ================================
   START PAYSTACK SUBSCRIPTION
================================ */

app.post(
  "/api/pay/subscribe",
  async (req, res) => {

    try {

      const email =
        String(req.body.email || "")
        .trim();


      if (!email) {

        return res.status(400).json({

          success: false,

          message:
            "Email is required"

        });

      }


      if (!PAYSTACK_SECRET_KEY) {

        return res.status(500).json({

          success: false,

          message:
            "Paystack secret key is not configured"

        });

      }


      if (!PAYSTACK_PLAN_CODE) {

        return res.status(500).json({

          success: false,

          message:
            "Paystack plan code is not configured"

        });

      }


      const response =
        await fetch(
          "https://api.paystack.co/transaction/initialize",
          {

            method: "POST",

            headers: {

              "Authorization":
                `Bearer ${PAYSTACK_SECRET_KEY}`,

              "Content-Type":
                "application/json"

            },

            body: JSON.stringify({

              email: email,

              plan:
                PAYSTACK_PLAN_CODE

            })

          }
        );


      const data =
        await response.json();


      if (
        !response.ok ||
        !data.status
      ) {

        console.error(
          "Paystack error:",
          data
        );

        return res.status(400).json({

          success: false,

          message:
            data.message ||
            "Unable to start payment"

        });

      }


      res.json({

        success: true,

        authorization_url:
          data.data.authorization_url,

        access_code:
          data.data.access_code,

        reference:
          data.data.reference

      });


    } catch (error) {

      console.error(
        "Payment error:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "Payment initialization failed"

      });

    }

  }
);


/* ================================
   VERIFY PAYMENT
================================ */

app.get(
  "/api/pay/verify/:reference",
  async (req, res) => {

    try {

      const reference =
        req.params.reference;


      if (!PAYSTACK_SECRET_KEY) {

        return res.status(500).json({

          success: false,

          message:
            "Paystack secret key is not configured"

        });

      }


      const response =
        await fetch(
          "https://api.paystack.co/transaction/verify/" +
          encodeURIComponent(reference),
          {

            method: "GET",

            headers: {

              "Authorization":
                `Bearer ${PAYSTACK_SECRET_KEY}`

            }

          }
        );


      const data =
        await response.json();


      if (
        !response.ok ||
        !data.status
      ) {

        return res.status(400).json({

          success: false,

          message:
            data.message ||
            "Payment verification failed"

        });

      }


      const payment =
        data.data;


      if (
        payment.status !== "success"
      ) {

        return res.json({

          success: false,

          premium: false,

          status:
            payment.status

        });

      }


      res.json({

        success: true,

        premium: true,

        email:
          payment.customer?.email || "",

        reference:
          payment.reference,

        amount:
          payment.amount,

        currency:
          payment.currency

      });


    } catch (error) {

      console.error(
        "Verification error:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "Payment verification failed"

      });

    }

  }
);


/* ================================
   PAYSTACK WEBHOOK
================================ */

app.post(
  "/api/paystack/webhook",
  (req, res) => {

    try {

      const signature =
        req.headers[
          "x-paystack-signature"
        ];


      if (!PAYSTACK_SECRET_KEY) {

        return res.sendStatus(500);

      }


      const hash =
        crypto
          .createHmac(
            "sha512",
            PAYSTACK_SECRET_KEY
          )
          .update(
            JSON.stringify(req.body)
          )
          .digest("hex");


      if (
        !signature ||
        signature !== hash
      ) {

        console.log(
          "Invalid Paystack webhook"
        );

        return res.sendStatus(401);

      }


      const event =
        req.body;


      console.log(
        "Paystack event:",
        event.event
      );


      if (
        event.event ===
        "charge.success"
      ) {

        console.log(
          "Successful payment:",
          event.data.reference
        );

        console.log(
          "Customer:",
          event.data.customer?.email
        );

      }


      if (
        event.event ===
        "subscription.create"
      ) {

        console.log(
          "Subscription created"
        );

      }


      if (
        event.event ===
        "subscription.disable"
      ) {

        console.log(
          "Subscription disabled"
        );

      }


      res.sendStatus(200);


    } catch (error) {

      console.error(
        "Webhook error:",
        error
      );

      res.sendStatus(500);

    }

  }
);


/* ================================
   SERVER
================================ */

app.listen(
  PORT,
  () => {

    console.log(
      `BizBoost MP3 backend running on port ${PORT}`
    );

  }
);
