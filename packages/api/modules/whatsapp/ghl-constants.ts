/**
 * Sentinel `state` value that tells the OAuth callback page to PROVISION a new
 * subaccount from the chosen GHL location, rather than link an existing one. It
 * must not collide with a real subaccount id (cuid), so a bracketed literal is
 * safe.
 *
 * Kept in a dependency-free module so the `"use client"` callback page can import
 * it without pulling server-only procedure/DB code into the browser bundle.
 */
export const GHL_PROVISION_STATE = "[provision]";

/**
 * localStorage key carrying the "provision a new subaccount" intent across the
 * OAuth round-trip. GHL drops the `state` param when the app is already installed
 * on a location (the second-location case), so the sentinel alone isn't reliable
 * — the opener sets this before launching the popup, and the callback reads it.
 */
export const GHL_PROVISION_INTENT_KEY = "wabridge_ghl_provision_intent";
