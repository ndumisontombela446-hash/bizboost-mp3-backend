const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
   ADEARN SA SECURITY
================================ */

const ADEARN_ENCRYPTION_KEY =
  process.env.ADEARN_ENCRYPTION_KEY;


/*
   IMPORTANT:
   Set ADEARN_ENCRYPTION_KEY in Render.

   It should be a long random secret.
*/


/* ================================
   WITHDRAWAL STORAGE
================================ */

const DATA_DIR =
  path.join(__dirname, "data");

const WITHDRAWAL_FILE =
  path.join(
    DATA_DIR,
    "withdrawals.enc"
  );


if (!fs.existsSync(DATA_DIR)) {

  fs.mkdirSync(
    DATA_DIR,
    { recursive: true }
  );

}


/* ================================
   ENCRYPTION FUNCTIONS
================================ */

function getEncryptionKey() {

  if (!ADEARN_ENCRYPTION_KEY) {

    throw new Error(
      "ADEARN_ENCRYPTION_KEY is not configured"
    );

  }

  return crypto
    .createHash("sha256")
    .update(ADEARN_ENCRYPTION_KEY)
    .digest();

}


function encryptData(data) {

  const key =
    getEncryptionKey();

  const iv =
    crypto.randomBytes(16);

  const cipher =
    crypto.createCipheriv(
      "aes-256-cbc",
      key,
      iv
    );

  let encrypted =
    cipher.update(
      JSON.stringify(data),
      "utf8",
      "hex"
    );

  encrypted +=
    cipher.final("hex");


  return (
    iv.toString("hex") +
    ":" +
    encrypted
  );

}


function decryptData(encryptedText) {

  const key =
    getEncryptionKey();

  const parts =
    encryptedText.split(":");

  const iv =
    Buffer.from(
      parts[0],
      "hex"
    );

  const encrypted =
    parts[1];

  const decipher =
    crypto.createDecipheriv(
      "aes-256-cbc",
      key,
      iv
    );

  let decrypted =
    decipher.update(
      encrypted,
      "hex",
      "utf8"
    );

  decrypted +=
    decipher.final("utf8");


  return JSON.parse(
    decrypted
  );

}


/* ================================
   READ WITHDRAWALS
================================ */

function readWithdrawals() {

  if (
    !fs.existsSync(
      WITHDRAWAL_FILE
    )
  ) {

    return [];

  }


  try {

    const encrypted =
      fs.readFileSync(
        WITHDRAWAL_FILE,
        "utf8"
      );


    return decryptData(
      encrypted
    );

  } catch (error) {

    console.error(
      "Withdrawal database error:",
      error
    );

    return [];

  }

}


/* ================================
   SAVE WITHDRAWALS
================================ */

function saveWithdrawals(
  withdrawals
) {

  const encrypted =
    encryptData(
      withdrawals
    );


  fs.writeFileSync(
    WITHDRAWAL_FILE,
    encrypted,
    "utf8"
  );

}


/* ================================
   HOME
================================ */

app.get("/", (req, res) => {

  res.json({

    app: "BizBoost MP3",

    status: "online",

    payments:
      PAYSTACK_SECRET_KEY
        ? "configured"
        : "not configured",

    adEarn:
      "enabled"

  });

});


/* ================================
   MUSIC SEARCH
================================ */

app.get(
  "/api/search",
  async (req, res) => {

    try {

      const query =
        String(
          req.query.q || ""
        ).trim();


      if (!query) {

        return res.status(400).json({

          error:
            "Search query is required"

        });

      }


      const url =
        "https://api.jamendo.com/v3.0/tracks/" +
        "?client_id=" +
        encodeURIComponent(
          JAMENDO_CLIENT_ID
        ) +
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

          error:
            "Jamendo API request failed"

        });

      }


      const data =
        await response.json();


      const tracks =
        (data.results || [])
          .map(track => ({

            id:
              track.id,

            name:
              track.name,

            artist:
              track.artist_name,

            image:
              track.image ||
              track.album_image ||
              "",

            audio:
              track.audio ||
              "",

            download:
              track.audiodownload_allowed
                ? (
                    track.audiodownload ||
                    ""
                  )
                : "",

            downloadAllowed:
              Boolean(
                track.audiodownload_allowed
              )

          }));


      res.json({

        success: true,

        count:
          tracks.length,

        results:
          tracks

      });


    } catch (error) {

      console.error(
        "Search error:",
        error
      );

      res.status(500).json({

        error:
          "Server error"

      });

    }

  }
);


/* ==================================================
   ADEARN SA
   SAVE WITHDRAWAL DETAILS
================================================== */

app.post(
  "/api/withdrawal-details",
  (req, res) => {

    try {

      const {

        userId,

        name,

        email,

        paymentMethod,

        bankName,

        accountNumber,

        branchCode,

        paypalEmail,

        amount

      } = req.body;


      /* =========================
         BASIC VALIDATION
      ========================= */

      if (!name) {

        return res.status(400).json({

          success: false,

          message:
            "Account holder name is required"

        });

      }


      if (!paymentMethod) {

        return res.status(400).json({

          success: false,

          message:
            "Payment method is required"

        });

      }


      if (
        paymentMethod === "Bank" &&
        !accountNumber
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Bank account number is required"

        });

      }


      if (
        paymentMethod === "PayPal" &&
        !paypalEmail
      ) {

        return res.status(400).json({

          success: false,

          message:
            "PayPal email is required"

        });

      }


      /* =========================
         CREATE ID
      ========================= */

      const withdrawalId =
        "WD-" +
        Date.now() +
        "-" +
        crypto
          .randomBytes(4)
          .toString("hex");


      /* =========================
         WITHDRAWAL RECORD
      ========================= */

      const withdrawal = {

        id:
          withdrawalId,

        userId:
          userId || "",

        name:
          String(name)
            .trim(),

        email:
          email
            ? String(email).trim()
            : "",

        paymentMethod:
          String(paymentMethod)
            .trim(),

        bankName:
          bankName
            ? String(bankName).trim()
            : "",

        accountNumber:
          accountNumber
            ? String(accountNumber).trim()
            : "",

        branchCode:
          branchCode
            ? String(branchCode).trim()
            : "",

        paypalEmail:
          paypalEmail
            ? String(paypalEmail).trim()
            : "",

        amount:
          Number(amount) || 0,

        status:
          "pending",

        createdAt:
          new Date().toISOString()

      };


      /* =========================
         READ EXISTING
      ========================= */

      const withdrawals =
        readWithdrawals();


      /* =========================
         ADD NEW REQUEST
      ========================= */

      withdrawals.push(
        withdrawal
      );


      /* =========================
         SAVE
      ========================= */

      saveWithdrawals(
        withdrawals
      );


      /* =========================
         RESPONSE
      ========================= */

      res.status(201).json({

        success: true,

        message:
          "Withdrawal details saved",

        withdrawalId:
          withdrawalId,

        status:
          "pending"

      });


    } catch (error) {

      console.error(
        "Withdrawal save error:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to save withdrawal details"

      });

    }

  }
);


/* ==================================================
   ADEARN SA
   VIEW WITHDRAWALS
================================================== */

app.get(
  "/api/withdrawals",
  (req, res) => {

    try {

      const withdrawals =
        readWithdrawals();


      /*
        TEMPORARY ADMIN ENDPOINT.

        DO NOT expose this publicly
        in production without authentication.
      */


      res.json({

        success: true,

        count:
          withdrawals.length,

        withdrawals:
          withdrawals

      });


    } catch (error) {

      console.error(
        "Withdrawal read error:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to load withdrawals"

      });

    }

  }
);


/* ==================================================
   ADEARN SA
   UPDATE WITHDRAWAL STATUS
================================================== */

app.patch(
  "/api/withdrawals/:id",
  (req, res) => {

    try {

      const id =
        req.params.id;

      const status =
        String(
          req.body.status || ""
        ).trim();


      const allowedStatuses = [

        "pending",

        "approved",

        "paid",

        "rejected"

      ];


      if (
        !allowedStatuses.includes(
          status
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid withdrawal status"

        });

      }


      const withdrawals =
        readWithdrawals();


      const withdrawal =
        withdrawals.find(
          item =>
            item.id === id
        );


      if (!withdrawal) {

        return res.status(404).json({

          success: false,

          message:
            "Withdrawal not found"

        });

      }


      withdrawal.status =
        status;


      withdrawal.updatedAt =
        new Date().toISOString();


      saveWithdrawals(
        withdrawals
      );


      res.json({

        success: true,

        message:
          "Withdrawal status updated",

        withdrawal

      });


    } catch (error) {

      console.error(
        "Status update error:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to update withdrawal"

      });

    }

  }
);


/* ================================
   START PAYSTACK SUBSCRIPTION
================================ */

app.post(
  "/api/pay/subscribe",
  async (req, res) => {

    try {

      const email =
        String(
          req.body.email || ""
        ).trim();


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
          encodeURIComponent(
            reference
          ),
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
        payment.status !==
        "success"
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
          payment.customer?.email ||
          "",

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
            JSON.stringify(
              req.body
            )
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
