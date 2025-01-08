export function shiftU8Arr(bytes: Uint8Array, k: number): Uint8Array
{
    // Create a copy of the input array to avoid modifying the original
    const result = Uint8Array.prototype.slice.call( bytes );
    
    k = Math.round( k );
    // No shift needed
    if (k === 0) return result;
    
    // Calculate absolute shift value and direction
    const absShift = Math.abs(k);
    const isLeftShift = k > 0;

    // If shift amount exceeds array length in bits, return all zeros
    if( absShift >= result.length * 8 ) return new Uint8Array( result.length ); // result.fill( 0 );
    
    // Calculate full byte shifts and remaining bits
    const byteShifts = Math.floor(absShift / 8);
    const bitShifts = absShift % 8;
    
    if (isLeftShift) {
        // Left shift
        // First handle byte-wise shifts
        for (let i = 0; i < result.length - byteShifts; i++) {
            result[i] = result[i + byteShifts];
        }
        
        // Then handle remaining bits
        if (bitShifts > 0) {
            for (let i = 0; i < result.length - byteShifts - 1; i++) {
                result[i] = ((result[i] << bitShifts) & 0xFF) | 
                           (result[i + 1] >> (8 - bitShifts));
            }
            // Handle the last byte that needs shifting
            if (result.length - byteShifts > 0) {
                result[result.length - byteShifts - 1] = 
                    (result[result.length - byteShifts - 1] << bitShifts) & 0xFF;
            }
        }

        // Zero out the trailing bytes
        for (let i = result.length - byteShifts; i < result.length; i++) {
            result[i] = 0;
        }
    } else {
        // Right shift
        // First handle byte-wise shifts
        for (let i = result.length - 1; i >= byteShifts; i--) {
            result[i] = result[i - byteShifts];
        }
        
        // Then handle remaining bits
        if (bitShifts > 0) {
            for (let i = result.length - 1; i > byteShifts; i--) {
                result[i] = (result[i] >> bitShifts) | 
                           ((result[i - 1] & ((1 << bitShifts) - 1)) << (8 - bitShifts));
            }
            // Handle the first byte that needs shifting
            if (byteShifts < result.length) {
                result[byteShifts] = result[byteShifts] >> bitShifts;
            }
        }

        // Zero out the leading bytes
        for (let i = 0; i < byteShifts; i++) {
            result[i] = 0;
        }
    }
    
    return result;
}