import { setupServer } from "msw/node";
import { servicesHandler } from "./fixtures";

// The catalog is read by every contract form; tests override it with server.use().
export const server = setupServer(servicesHandler());
