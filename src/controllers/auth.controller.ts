import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";

export async function registerCompany(req: Request, res: Response) {
  const { companyName, companySlug, username, password } = req.body;

  try {
    const result = await AuthService.registerCompany({ companyName, companySlug, username, password });
    res.status(201).json(result);
  } catch (error: any) {
    if (error.message === "username_taken") {
      return res.status(409).json({ error: "Username already exists" });
    }
    if (error.message === "company_slug_taken") {
      return res.status(409).json({ error: "Company URL/Slug already exists" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function login(req: Request, res: Response) {
  const { username, password } = req.body;

  try {
    const result = await AuthService.login(username, password);
    res.json(result);
  } catch (error: any) {
    if (error.message === "user_not_found" || error.message === "incorrect_password") {
      return res.status(401).json({ error: "invalid credentials" });
    }
    if (error.message === "jwt_config_error") {
      return res.status(500).json({ error: "Internal configuration error" });
    }
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}