export function rotateU8Arr(bytes: Uint8Array, k: number): Uint8Array {
    // Create a copy of the input array to avoid modifying the original
    const result = Uint8Array.prototype.slice.call(bytes);
    
    // Convert to left rotation amount within the range of total bits
    const totalBits = bytes.length * 8;
    // If k is negative, convert to equivalent left rotation
    if (k < 0) {
        k = totalBits - ((-k) % totalBits);
    } else {
        k = k % totalBits;
    }

    // No rotation needed
    if (k === 0) return result;
    
    // Calculate full byte rotations and remaining bits
    const byteRotations = Math.floor(k / 8);
    const bitRotations = k % 8;
    
    // First handle byte-wise rotations
    if (byteRotations > 0) {
        const temp = result.slice();  // Save original array
        for (let i = 0; i < bytes.length; i++) {
            const newIndex = (i + byteRotations) % bytes.length;
            result[newIndex] = temp[i];
        }
    }
    
    // Then handle remaining bits
    if (bitRotations > 0) {
        const lastBits = result[result.length - 1] >> (8 - bitRotations);
        
        // Rotate each byte
        for (let i = result.length - 1; i > 0; i--) {
            result[i] = ((result[i] << bitRotations) & 0xFF) | 
                       (result[i - 1] >> (8 - bitRotations));
        }
        
        // Handle first byte - combine with saved bits from the last byte
        result[0] = ((result[0] << bitRotations) & 0xFF) | lastBits;
    }
    
    return result;
}