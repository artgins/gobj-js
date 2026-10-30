/***********************************************************************
 *          secret_masking_shapes.js
 *
 *      The shapes of text that the linearity tests of the secret masking
 *      mask (secret_masking_linear.test.js counts their work,
 *      secret_masking_time.test.js times it): each one a `unit`
 *      repeated, and the call that masks it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    mask_secrets_inline,
    json_mask_secrets,
} from "../src/index.js";

/*
 *  [what, unit, mask]: `mask(text)` masks `unit` repeated
 */
export const MASKING_SHAPES = [];

for(const unit of ["a=", "abcd=", " attribute=", "pin=\"", "abc?token=x&"]) {
    MASKING_SHAPES.push(["mask_secrets_inline()", unit, (text) => mask_secrets_inline(text)]);
    MASKING_SHAPES.push(["json_mask_secrets()", unit, (text) => json_mask_secrets({anything: text})]);
}

// and the shapes that once ran long, as in C: a scheme word repeated, ':' after
// secrets' names, a container that does not close, a JWT's dots
for(const unit of ["Bearer ", "basic ", "token:", "\"pin\": {[", "eyJ.", "x-auth-token: \\\""]) {
    MASKING_SHAPES.push(["mask_secrets_inline()", unit, (text) => mask_secrets_inline(text)]);
}

// and of 7.26.24: names in brackets and %-encoded, the userinfo of a URL
for(const unit of ["[pin]=\"", "t%6Fken=x&", "a://b:c@", "p%3Dx%26", "%2541", "%25253D"]) {
    MASKING_SHAPES.push(["mask_secrets_inline()", unit, (text) => mask_secrets_inline(text)]);
}

// and a secret value: all of the text after "password=" is masked
MASKING_SHAPES.push(["a secret value", "x", (text) => mask_secrets_inline("password=" + text)]);
