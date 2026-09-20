/**
 * Kde aplikace bezi. Rozhoduje o tom, zda umime PDF vyrobit na serveru,
 * nebo to musime nechat na prohlizeci.
 */

/** Na Vercelu bezi kod v serverless funkci, kam se Chromium nevejde. */
export const isServerless = Boolean(process.env.VERCEL);

/** Server umi vytisknout PDF sam, jen kdyz ma k dispozici Chromium. */
export const canRenderPdfOnServer = !isServerless;
