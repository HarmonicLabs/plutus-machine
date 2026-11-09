import { ed25519SignatureMayBeValid, sha2_256_sync, verifyEd25519Signature_sync } from "@harmoniclabs/crypto";
import { fromHex, fromUtf8, uint8ArrayEq } from "@harmoniclabs/uint8array-utils";

/** the part of WebCrypto's `SubtleCrypto` the machine uses */
export interface SubtleCryptoLike {
    digest( algorithm: "SHA-256", data: Uint8Array ): Promise<ArrayBuffer>;
    importKey(
        format: "raw",
        keyData: Uint8Array,
        algorithm: { name: "Ed25519" },
        extractable: false,
        keyUsages: [ "verify" ]
    ): Promise<unknown>;
    verify( algorithm: { name: "Ed25519" }, key: any, signature: Uint8Array, data: Uint8Array ): Promise<boolean>;
}

/** what a `SubtleCryptoLike` computes with the results of the Cardano node */
export interface WebCryptoSupport {
    readonly subtle: SubtleCryptoLike;
    readonly sha2_256: boolean;
    readonly ed25519: boolean;
}

const ED25519 = Object.freeze({ name: "Ed25519" as const });

export function globalSubtle(): SubtleCryptoLike | undefined
{
    try {
        return ( globalThis as any ).crypto?.subtle;
    } catch {
        return undefined;
    }
}

const detected = new WeakMap<SubtleCryptoLike, Promise<WebCryptoSupport>>();

/** checked once per `subtle` */
export function webCryptoSupport( subtle: SubtleCryptoLike ): Promise<WebCryptoSupport>
{
    let support = detected.get( subtle );
    if( support === undefined )
    {
        support = Promise.all([ detectSha2_256( subtle ), detectEd25519( subtle ) ])
            .then(([ sha2_256, ed25519 ]) => ({ subtle, sha2_256, ed25519 }));
        detected.set( subtle, support );
    }
    return support;
}

async function detectSha2_256( subtle: SubtleCryptoLike ): Promise<boolean>
{
    try {
        const probe = fromUtf8( "plutus-machine" );
        return uint8ArrayEq( new Uint8Array( await subtle.digest( "SHA-256", probe ) ), sha2_256_sync( probe ) );
    } catch {
        return false;
    }
}

/**
 * Answers of libsodium, as the node gets them; the last two pass the byte checks
 * and are accepted by engines that check the equation with the cofactor, which
 * would then answer `true` where the node answers `false`.
 */
const ED25519_PROBES: [ key: string, message: string, signature: string, valid: boolean ][] = [
    [
        "4601c4895988d9ff948f05e78b372594032ad2ade5fb475e5348f0ae77d09a8c",
        "b960b8",
        "07c0637b4c0e95fff9e734aa51d4840e2ced028226c1ae974318ed9358e08231b051362ec40b71485801d8e1f1d41ec259a28065d7e0b67823466403643e5f03",
        true
    ],
    [
        // R = [r]B plus a point of order 8
        "390d73c08375b4256830bc722eb496e115fb731086d3d478eb07582029260162",
        "f1",
        "1f68edf71430f3ee6f1b9929f470ee3b19ecb408ac0fb15b72f7dcb643fad73675ffa73b8cebabeb9c74b0ce34d80d3e05bcc5e00f928769375e765a601d8d06",
        false
    ],
    [
        // the key is [a]B plus a point of small order
        "e4b51745bb648a29aa664dc18dbced682bf1b652ce54be8b7123e6be2605dd61",
        "",
        "e74538371e9e195a62a26446a12157833d4a2678b45a739e5bd7dbec45e01c1bd0ef4b666ddcee7d2259d4d255fa2eefce776a74a44708172dd6714baaad7b03",
        false
    ],
];

async function detectEd25519( subtle: SubtleCryptoLike ): Promise<boolean>
{
    try {
        for( const [ key, message, signature, valid ] of ED25519_PROBES )
        {
            const imported = await subtle.importKey( "raw", fromHex( key ), ED25519, false, [ "verify" ] );
            if( await subtle.verify( ED25519, imported, fromHex( signature ), fromHex( message ) ) !== valid ) return false;
        }
        return true;
    } catch {
        return false;
    }
}

/** never rejects: computes in JavaScript when the engine fails */
export function sha2_256_webCrypto( subtle: SubtleCryptoLike, bytes: Uint8Array ): Promise<Uint8Array>
{
    return subtle.digest( "SHA-256", bytes ).then(
        digest => new Uint8Array( digest ),
        () => new Uint8Array( sha2_256_sync( bytes ) )
    );
}

/**
 * The answer of the node, provided `subtle` passed `webCryptoSupport`: the byte checks
 * of libsodium here, the equation by the engine. Never rejects: verifies in JavaScript
 * when the engine fails.
 */
export function verifyEd25519_webCrypto(
    subtle: SubtleCryptoLike,
    key: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array
): Promise<boolean>
{
    if( !ed25519SignatureMayBeValid( signature, key ) ) return Promise.resolve( false );
    return subtle.importKey( "raw", key, ED25519, false, [ "verify" ] )
        .then( imported => subtle.verify( ED25519, imported, signature, message ) )
        .catch( () => verifyEd25519Signature_sync( signature, message, key ) );
}
