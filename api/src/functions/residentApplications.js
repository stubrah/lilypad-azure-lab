const { app } = require("@azure/functions");
const { getPool, sql } = require("../shared/database");

const allowedTimelines = new Set(["asap", "30days", "60days", "exploring"]);

function cleanString(value, maxLength, required = false) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error("A required field is missing.");
    return null;
  }
  if (typeof value !== "string") throw new Error("All fields must be text.");
  const cleaned = value.trim();
  if (required && !cleaned) throw new Error("A required field is missing.");
  if (cleaned.length > maxLength) throw new Error("A field exceeds its maximum length.");
  return cleaned || null;
}

app.http("residentApplications", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "resident-applications",
  handler: async (request, context) => {
    if (process.env.LAB_MODE !== "true") {
      return { status: 503, jsonBody: { error: "The training endpoint is disabled." } };
    }

    try {
      const body = await request.json();
      const fullName = cleanString(body.fullName, 100, true);
      const email = cleanString(body.email, 254, true)?.toLowerCase();
      const phone = cleanString(body.phone, 30);
      const situation = cleanString(body.situation, 1000);
      const timeline = cleanString(body.timeline, 20);

      if (!email.endsWith("@example.com")) {
        return { status: 400, jsonBody: { error: "Use a fake @example.com email in this lab." } };
      }
      if (timeline && !allowedTimelines.has(timeline)) {
        return { status: 400, jsonBody: { error: "Choose a valid housing timeline." } };
      }

      const applicationId = crypto.randomUUID();
      const pool = await getPool();
      await pool.request()
        .input("applicationId", sql.UniqueIdentifier, applicationId)
        .input("fullName", sql.NVarChar(100), fullName)
        .input("email", sql.NVarChar(254), email)
        .input("phone", sql.NVarChar(30), phone)
        .input("situation", sql.NVarChar(1000), situation)
        .input("timeline", sql.VarChar(20), timeline)
        .query(`
          INSERT INTO dbo.ResidentApplications
            (ApplicationId, FullName, Email, Phone, Situation, Timeline)
          VALUES
            (@applicationId, @fullName, @email, @phone, @situation, @timeline);
        `);

      context.log("Fake resident application saved", { applicationId });
      return { status: 201, jsonBody: { applicationId, status: "saved" } };
    } catch (error) {
      const isInputError = /required|field|text|JSON/i.test(error.message);
      context.error("Resident application failed", error);
      return {
        status: isInputError ? 400 : 500,
        jsonBody: { error: isInputError ? error.message : "The application could not be saved." },
      };
    }
  },
});

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async () => {
    const pool = await getPool();
    await pool.request().query("SELECT 1 AS Ready;");
    return { jsonBody: { status: "healthy", database: "reachable" } };
  },
});
