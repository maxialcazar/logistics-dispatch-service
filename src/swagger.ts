import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
	definition: {
		openapi: "3.0.0",
		info: {
			title: "Logistics Dispatch Service API",
			version: "1.0.0",
			description: "API for managing logistics, drivers, zones, and packages.",
		},
		servers: [
			{
				url: "http://localhost:3001",
				description: "Development server",
			},
		],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
				},
			},
			schemas: {
				Error: {
					type: "object",
					properties: {
						error: {
							type: "string",
						},
					},
				},
			},
			security: [
				{
					bearerAuth: [],
				},
			],
		},
		apis: ["./src/routes/*.ts"], // Path to the API docs
	},
};

export const swaggerSpec = swaggerJsdoc(options);
