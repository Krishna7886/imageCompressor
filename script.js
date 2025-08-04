document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('imageInput');
    const previewsContainer = document.getElementById('previews-container');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    
    let compressedFilesForZip = [];
    let filesToProcess = 0;
    let filesProcessed = 0;

    imageInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        // Reset UI
        previewsContainer.innerHTML = '';
        compressedFilesForZip = [];
        downloadAllBtn.style.display = 'none';
        
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        filesToProcess = imageFiles.length;
        filesProcessed = 0;

        if (filesToProcess === 0) return;

        imageFiles.forEach(file => {
            processImage(file);
        });
    });

    async function processImage(file) {
        const originalSrc = URL.createObjectURL(file);
        const img = new Image();
        img.src = originalSrc;
        
        // Wait for the image to load into memory
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const targetSize = file.size * 0.10; // Aim for 90% reduction
        let result;
        
        // --- THIS IS THE KEY LOGIC ---
        // If it's a PNG, we MUST convert to JPEG to get high compression
        if (file.type === 'image/png') {
            result = await compressImage(img, 'image/jpeg', targetSize, true); // Force conversion
        } else {
            // For JPEGs and other types, compress in their native format
            result = await compressImage(img, file.type, targetSize, false);
        }
        
        displayPreviewCard(file, originalSrc, result);
        compressedFilesForZip.push({ 
            name: changeFileExtension(file.name, result.mimeType), 
            blob: result.blob 
        });
        
        checkCompletion();
    }
    
    // --- The Core Compression Algorithm ---
    async function compressImage(img, mimeType, targetSize, isPngConversion = false) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Resize image if it's very large for better performance and compression
        const MAX_DIMENSION = 1920;
        const { width, height } = resizeDimensions(img.width, img.height, MAX_DIMENSION);
        canvas.width = width;
        canvas.height = height;

        // If converting a transparent PNG, fill the background with white first
        if (isPngConversion) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        // For non-compressible types, just return the resized canvas
        if (mimeType !== 'image/jpeg' && mimeType !== 'image/webp') {
             const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType));
             return { blob, src: canvas.toDataURL(mimeType), format: `(Resized as ${mimeType.split('/')[1].toUpperCase()})` };
        }

        // --- Iterative Search for best quality ---
        let minQuality = 0;
        let maxQuality = 1.0;
        let bestResult = { blob: null, src: '', quality: 0 };
        
        // Perform 7 iterations to find the best quality setting
        for (let i = 0; i < 7; i++) {
            const quality = (minQuality + maxQuality) / 2;
            const src = canvas.toDataURL(mimeType, quality);
            const blob = dataURLtoBlob(src);

            if (blob.size <= targetSize) {
                bestResult = { blob, src, quality };
                minQuality = quality; // This quality is good, try for even better
            } else {
                maxQuality = quality; // Quality too high, need to lower it
            }
        }
        
        // If we never found a good enough compression, return the lowest quality result
        if (!bestResult.blob) {
            const src = canvas.toDataURL(mimeType, 0.1);
            bestResult = { src, blob: dataURLtoBlob(src), quality: 0.1 };
        }
        
        bestResult.format = `(as ${mimeType.split('/')[1].toUpperCase()})`;
        return bestResult;
    }

    function checkCompletion() {
        filesProcessed++;
        if (filesProcessed === filesToProcess && compressedFilesForZip.length > 0) {
            downloadAllBtn.style.display = 'block';
        }
    }

    function displayPreviewCard(originalFile, originalSrc, compressedResult) {
        const card = document.createElement('div');
        card.className = 'preview-card';
        const downloadFileName = changeFileExtension(originalFile.name, compressedResult.blob.type);
        
        card.innerHTML = `
            <div class="image-box">
                <h2>Original</h2>
                <img src="${originalSrc}">
                <p class="image-info">${originalFile.name}</p>
                <p class="image-info">Size: ${(originalFile.size / 1024).toFixed(2)} KB</p>
            </div>
            <div class="image-box">
                <h2>Compressed <span class="format-info">${compressedResult.format || ''}</span></h2>
                <img src="${compressedResult.src}">
                <p class="image-info">Size: ${(compressedResult.blob.size / 1024).toFixed(2)} KB</p>
                <a href="${compressedResult.src}" download="compressed_${downloadFileName}" class="download-btn">Download</a>
            </div>
        `;
        previewsContainer.appendChild(card);
    }
    
    // --- UTILITY FUNCTIONS ---
    function resizeDimensions(width, height, max) {
        if (width > max || height > max) {
            if (width > height) {
                height *= max / width;
                width = max;
            } else {
                width *= max / height;
                height = max;
            }
        }
        return { width, height };
    }

    function dataURLtoBlob(dataurl) {
        const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new Blob([u8arr], { type: mime });
    }
    
    function changeFileExtension(filename, mimeType) {
        const ext = mimeType.split('/')[1];
        const baseName = filename.substring(0, filename.lastIndexOf('.'));
        return `${baseName}.${ext}`;
    }
    
    downloadAllBtn.addEventListener('click', () => {
        const zip = new JSZip();
        compressedFilesForZip.forEach(file => zip.file(file.name, file.blob));
        zip.generateAsync({ type: 'blob' }).then(content => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = 'compressed_images.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    });
});
