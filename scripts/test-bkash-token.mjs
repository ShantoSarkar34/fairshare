
const required = [
  "BKASH_USERNAME",
  "BKASH_PASSWORD",
  "BKASH_APP_KEY",
  "BKASH_APP_SECRET",
  "BKASH_BASE_URL",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const baseUrl = process.env.BKASH_BASE_URL.replace(/\/+$/, "");

const endpoint =
  `${baseUrl}/tokenized/checkout/token/grant`;

async function testGrantToken() {
  console.log("Testing bKash Sandbox Grant Token API...");
  console.log(`Endpoint: ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        username: process.env.BKASH_USERNAME,
        password: process.env.BKASH_PASSWORD,
      },
      body: JSON.stringify({
        app_key: process.env.BKASH_APP_KEY,
        app_secret: process.env.BKASH_APP_SECRET,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const result = await response.json();

    console.log("\nHTTP Status:", response.status);
    console.log("bKash Status:", result.statusCode ?? "Not provided");
    console.log(
      "Message:",
      result.statusMessage ?? result.errorMessage ?? "No message",
    );

    if (response.ok && result.id_token) {
      console.log("\nSUCCESS: Access token received!");
      console.log("Token type:", result.token_type ?? "Not provided");
      console.log("Expires in:", result.expires_in ?? "Not provided");
      console.log("Token value: [HIDDEN]");
    } else {
      console.log("\nFAILED: No access token received.");
      console.log("Check your sandbox credentials and API version.");
    }
  } catch (error) {
    console.error("\nRequest failed:", error.message);
    console.error("Check your internet connection and sandbox endpoint.");
  }
}

testGrantToken();
