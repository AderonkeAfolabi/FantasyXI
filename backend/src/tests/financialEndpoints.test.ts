import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Request, Response, NextFunction } from "express";
import {
  getPaymentRequirement,
  submitPayment,
  verifyPayment,
  getSettlementPlan,
  reconcileLeague,
} from "../controllers/financial.controller.js";

function createMockReqRes(options: {
  user?: { id: string; email: string; username: string };
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, any>;
}) {
  let statusCode = 200;
  let jsonResponse: any = null;
  let nextError: any = null;

  const req = {
    user: options.user,
    params: options.params || {},
    query: options.query || {},
    body: options.body || {},
    headers: {},
  } as unknown as Request;

  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (payload: any) => {
      jsonResponse = payload;
      return res;
    },
  } as unknown as Response;

  const next: NextFunction = (err?: any) => {
    nextError = err;
  };

  return {
    req,
    res,
    next,
    getStatusCode: () => statusCode,
    getJsonResponse: () => jsonResponse,
    getNextError: () => nextError,
  };
}

describe("Financial Controllers & Request Handling", () => {
  describe("getPaymentRequirement Controller", () => {
    it("should reject unauthenticated request with 401", async () => {
      const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
        user: undefined, // No user attached
        params: { leagueId: "league_1" },
      });

      await getPaymentRequirement(req, res, next);
      assert.equal(getStatusCode(), 401);
      assert.equal(getJsonResponse().success, false);
      assert.match(getJsonResponse().message, /Authentication required/);
    });

    it("should reject request when squadId is missing with 400", async () => {
      const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
        user: { id: "user_1", email: "test@example.com", username: "testuser" },
        params: { leagueId: "league_1" },
        query: {}, // Missing squadId
      });

      await getPaymentRequirement(req, res, next);
      assert.equal(getStatusCode(), 400);
      assert.equal(getJsonResponse().success, false);
      assert.match(getJsonResponse().message, /squadId is required/);
    });
  });

  describe("submitPayment Controller", () => {
    it("should reject unauthenticated request with 401", async () => {
      const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
        user: undefined,
        params: { leagueId: "league_1" },
        body: { stellarTxHash: "a".repeat(64), stellarAddress: "G" + "A".repeat(55) },
      });

      await submitPayment(req, res, next);
      assert.equal(getStatusCode(), 401);
      assert.equal(getJsonResponse().success, false);
    });

    it("should reject request with missing stellarTxHash or stellarAddress with 400", async () => {
      const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
        user: { id: "user_1", email: "test@example.com", username: "testuser" },
        params: { leagueId: "league_1" },
        body: { stellarTxHash: "a".repeat(64) }, // Missing stellarAddress
      });

      await submitPayment(req, res, next);
      assert.equal(getStatusCode(), 400);
      assert.equal(getJsonResponse().success, false);
      assert.match(getJsonResponse().message, /Both stellarTxHash and stellarAddress/);
    });
  });

  describe("verifyPayment Controller", () => {
    it("should reject unauthenticated request with 401", async () => {
      const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
        user: undefined,
        params: { leagueId: "league_1" },
        body: { stellarTxHash: "a".repeat(64) },
      });

      await verifyPayment(req, res, next);
      assert.equal(getStatusCode(), 401);
      assert.equal(getJsonResponse().success, false);
    });

    it("should reject request with missing stellarTxHash with 400", async () => {
      const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
        user: { id: "user_1", email: "test@example.com", username: "testuser" },
        params: { leagueId: "league_1" },
        body: {}, // Missing stellarTxHash
      });

      await verifyPayment(req, res, next);
      assert.equal(getStatusCode(), 400);
      assert.equal(getJsonResponse().success, false);
      assert.match(getJsonResponse().message, /stellarTxHash is required/);
    });
  });

  describe("getSettlementPlan Controller", () => {
    it("should reject unauthenticated request with 401", async () => {
      const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
        user: undefined,
        params: { leagueId: "league_1" },
      });

      await getSettlementPlan(req, res, next);
      assert.equal(getStatusCode(), 401);
      assert.equal(getJsonResponse().success, false);
    });
  });

  describe("reconcileLeague Controller", () => {
    it("should reject unauthenticated request with 401", async () => {
      const { req, res, next, getStatusCode, getJsonResponse } = createMockReqRes({
        user: undefined,
        params: { leagueId: "league_1" },
      });

      await reconcileLeague(req, res, next);
      assert.equal(getStatusCode(), 401);
      assert.equal(getJsonResponse().success, false);
    });
  });
});
