/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

var assert = require('assert-plus');
var fmt = require('util').format;
var restify = require('restify');
var vasync = require('vasync');
var VError = require('verror').VError;

var common = require('./common');
var reg1 = require('./registry-client-v1');
var reg2 = require('./registry-client-v2');


// --- exported functions

/**
 * Create a Docker Registry API client.
 *
 * If `opts.version` is given, it will return a client using that API version.
 * Otherwise it will attempt to determine the most suitable version by
 * pinging the server.
 *
 * @param {String} opts.name  The docker *repository* string. E.g. "busybox",
 *      "joshwilsdon/nodejs", "alpine:latest", "quay.io/quay/elasticsearch".
 * @param {Number} opts.version  Optional API version number: 1 or 2.
 * @param ... All other v1 or v2 `createClient` options.
 */
function createClient(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.name, 'opts.name');
    assert.optionalNumber(opts.version, 'opts.version');
    assert.func(cb, 'cb');

    // Version given.
    if (opts.version === 1) {
        return cb(null, reg1.createClient(opts));
    } else if (opts.version === 2) {
        return cb(null, reg2.createClient(opts));
    } else if (opts.version) {
        return cb(new Error('invalid API version: ' + opts.version));
    }

    // First try v2.
    var client = reg2.createClient(opts);
    client.supportsV2(function (err, supportsV2) {
        if (err) {
            cb(err);
        } else if (supportsV2) {
            cb(null, client);
        } else {
            // Otherwise, fallback to v1.
            cb(null, reg1.createClient(opts));
        }
    });
}


/*
 * Login to a Docker registry. Basically this just means testing given
 * creds (username/password) against the registry.
 *
 * TODO usage
 *
 * See: docker.git:registry/auth.go#Login
 */
function login(opts, cb) {
    // TODO: doc the options. For now see the v1/v2 ping function comment.

    reg2.ping(opts, function (pingErr, body, pingRes, req) {
        if (!pingRes) {
            assert.ok(pingErr, 'no err *or* res from v2 ping');
            return cb(pingErr);
        }
        if (pingRes.statusCode === 404) {
            // Don't support v2, so try v1.
            reg1.login(opts, cb);
        } else {
            reg2.login(common.objMerge({
                // Pass this in so v2 login doesn't need to retry it for the
                // WWW-Authenticate header.
                pingRes: pingRes,
                pingErr: pingErr
            }, opts), cb);
        }
    });
}


// --- exports

module.exports = {
    createClient: createClient,
    login: login,

    createClientV2: reg2.createClient,
    pingV2: reg2.ping,
    loginV2: reg2.login,

    createClientV1: reg1.createClient,
    pingIndexV1: reg1.pingIndex,
    loginV1: reg1.login,

    DEFAULT_INDEX_NAME: common.DEFAULT_INDEX_NAME,
    DEFAULT_TAG: common.DEFAULT_TAG,
    parseRepo: common.parseRepo,
    parseIndex: common.parseIndex,
    parseRepoAndRef: common.parseRepoAndRef,
    // Using `parseRepoAndRef` is preferred over `parseRepoAndTag`.
    parseRepoAndTag: common.parseRepoAndTag
};
