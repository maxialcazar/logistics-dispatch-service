import "dotenv/config";
import request from "supertest";
import app from "../src/app";

describe("POST /api/auth/login validation", () => {
  it("should return 400 if username is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "password123" });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details).toContainEqual(expect.objectContaining({
      path: ["body", "username"]
    }));
  });

  it("should return 400 if password is too short", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "user", password: "123" });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details).toContainEqual(expect.objectContaining({
      path: ["body", "password"],
      message: "Password must be at least 6 characters"
    }));
  });
});
