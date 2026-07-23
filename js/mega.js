// mega.js — REPLACED. No MEGA. No CDN. No login.
// This file is kept only for compatibility. All storage is now local (IndexedDB).
// See localdb.js and storage.js for the actual implementation.

export async function login() { return true; }
export async function logout() { window.location.reload(); }
export async function restoreSession() { return true; }
export function isLoggedIn() { return true; }
export function getStorage() { return null; }
export function getVaultFolder() { return null; }
export async function getQuotaInfo() { return { used: 0, total: null, unlimited: true }; }
export function getUserInfo() { return { name: 'Personal Vault', email: 'Local Device' }; }
