const { useState, useEffect, useRef } = React;

function SimpleLineChart({ data, dataKey, color, title }) {
    if (!data || data.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                No data yet. Waiting for sensor messages...
            </div>
        );
    }

    const width = 800;
    const height = 300;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const values = data.map(d => d[dataKey]);
    const minVal = Math.min(...values) - 5;
    const maxVal = Math.max(...values) + 5;
    const range = maxVal - minVal;

    const points = data.map((d, i) => {
        const x = padding + (i / (data.length - 1)) * chartWidth;
        const y = padding + chartHeight - ((d[dataKey] - minVal) / range) * chartHeight;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div>
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map(p => (
                    <line
                        key={p}
                        x1={padding}
                        y1={padding + p * chartHeight}
                        x2={width - padding}
                        y2={padding + p * chartHeight}
                        stroke="#e0e0e0"
                        strokeWidth="1"
                    />
                ))}
                {/* Y-axis labels */}
                {[0, 0.25, 0.5, 0.75, 1].map(p => {
                    const val = maxVal - p * range;
                    return (
                        <text
                            key={p}
                            x={padding - 10}
                            y={padding + p * chartHeight + 5}
                            textAnchor="end"
                            fontSize="12"
                            fill="#666"
                        >
                            {val.toFixed(1)}
                        </text>
                    );
                })}
                {/* Line */}
                <polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                />
                {/* Data points */}
                {data.map((d, i) => {
                    const x = padding + (i / (data.length - 1)) * chartWidth;
                    const y = padding + chartHeight - ((d[dataKey] - minVal) / range) * chartHeight;
                    return (
                        <circle
                            key={i}
                            cx={x}
                            cy={y}
                            r="3"
                            fill={color}
                        />
                    );
                })}
            </svg>
        </div>
    );
}

function PayloadSamplesHistoryChart({ payloadHistory }) {
    const [hoverData, setHoverData] = useState(null);
    const [zoom, setZoom] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [lockScroll, setLockScroll] = useState(false);
    const svgRef = useRef(null);

    // Handle scroll lock with passive: false
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        const handleWheelEvent = (e) => {
            if (lockScroll) {
                e.preventDefault();
                e.stopPropagation();
                // Handle zoom
                const rect = svg.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const scaleAmount = e.deltaY > 0 ? 0.9 : 1.1;
                const newScale = Math.max(0.5, Math.min(10, zoom.scale * scaleAmount));

                const scaleChange = newScale / zoom.scale;
                const newOffsetX = mouseX - (mouseX - zoom.offsetX) * scaleChange;
                const newOffsetY = mouseY - (mouseY - zoom.offsetY) * scaleChange;

                setZoom({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
            }
        };

        svg.addEventListener('wheel', handleWheelEvent, { passive: false });

        return () => {
            svg.removeEventListener('wheel', handleWheelEvent, { passive: false });
        };
    }, [lockScroll, zoom]);

    if (!payloadHistory || payloadHistory.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                No payload data yet. Waiting for sensor messages...
            </div>
        );
    }

    // Flatten all samples with gaps only between complete datasets
    // Chunks from the same dataset are continuous (no gaps)
    const gapSize = 10; // Number of null points to insert as gap
    const allSamples = [];
    const sampleInfo = []; // Track which payload each sample belongs to

    payloadHistory.forEach((payload, payloadIndex) => {
        const samples = payload.samples || [];
        samples.forEach((sample, sampleIndex) => {
            allSamples.push(sample);
            sampleInfo.push({
                payloadIndex,
                sampleIndex,
                isStart: sampleIndex === 0,
                isEnd: sampleIndex === samples.length - 1,
                time: payload.time,
                isChunk: payload.isChunk || false,
                progress: payload.progress || null
            });
        });
        // Add gap after complete datasets (not after chunks)
        if (!payload.isChunk && payloadIndex < payloadHistory.length - 1) {
            for (let i = 0; i < gapSize; i++) {
                allSamples.push(null);
                sampleInfo.push({ isGap: true });
            }
        }
    });

    if (allSamples.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                No samples in history.
            </div>
        );
    }

    const width = 1200;
    const height = 400;
    const padding = 50;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Calculate min/max from non-null samples
    const validSamples = allSamples.filter(s => s !== null);
    const minVal = validSamples.length ? Math.min(...validSamples) : 0;
    const maxVal = validSamples.length ? Math.max(...validSamples) : 100;
    const range = maxVal - minVal || 1;

    // Apply zoom transformation
    const transform = `translate(${zoom.offsetX}, ${zoom.offsetY}) scale(${zoom.scale})`;

    // Calculate points for the line
    const points = allSamples.map((val, i) => {
        const x = padding + (i / (allSamples.length - 1 || 1)) * chartWidth;
        const y = val !== null ? padding + chartHeight - ((val - minVal) / range) * chartHeight : null;
        return { x, y, val, index: i, info: sampleInfo[i] };
    });

    // Build polylines (split at gaps)
    const polylines = [];
    let currentLine = [];
    points.forEach(p => {
        if (p.y !== null) {
            currentLine.push(`${p.x},${p.y}`);
        } else {
            if (currentLine.length > 0) {
                polylines.push(currentLine.join(' '));
                currentLine = [];
            }
        }
    });
    if (currentLine.length > 0) {
        polylines.push(currentLine.join(' '));
    }

    const chunkCount = payloadHistory.filter(p => p.isChunk).length;
    const completeCount = payloadHistory.filter(p => !p.isChunk).length;
    const gapCount = payloadHistory.filter((p, i) => !p.isChunk && i < payloadHistory.length - 1).length;

    // Handle mouse wheel zoom
    const handleWheel = (e) => {
        if (lockScroll) {
            e.preventDefault();
            e.stopPropagation();
        }
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const scaleAmount = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.5, Math.min(10, zoom.scale * scaleAmount));

        // Calculate new offset to zoom towards mouse position
        const scaleChange = newScale / zoom.scale;
        const newOffsetX = mouseX - (mouseX - zoom.offsetX) * scaleChange;
        const newOffsetY = mouseY - (mouseY - zoom.offsetY) * scaleChange;

        setZoom({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
    };

    // Handle mouse drag for panning
    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - zoom.offsetX, y: e.clientY - zoom.offsetY });
    };

    const handleMouseMove = (e) => {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const scaleX = width / rect.width;
        const scaleY = height / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        if (isDragging) {
            setZoom({
                ...zoom,
                offsetX: e.clientX - dragStart.x,
                offsetY: e.clientY - dragStart.y
            });
            return;
        }

        // Find closest point (account for zoom)
        let closestPoint = null;
        let minDist = Infinity;

        points.forEach(p => {
            if (p.y !== null) {
                const transformedX = p.x * zoom.scale + zoom.offsetX;
                const dist = Math.abs(transformedX - mouseX);
                if (dist < minDist && dist < 20 / zoom.scale) {
                    minDist = dist;
                    closestPoint = p;
                }
            }
        });

        if (closestPoint) {
            setHoverData({
                x: closestPoint.x * zoom.scale + zoom.offsetX,
                y: closestPoint.y * zoom.scale + zoom.offsetY,
                value: closestPoint.val,
                info: closestPoint.info,
                screenX: e.clientX,
                screenY: e.clientY
            });
        } else {
            setHoverData(null);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
        setHoverData(null);
    };

    const resetZoom = () => {
        setZoom({ scale: 1, offsetX: 0, offsetY: 0 });
    };

    return (
        <div>
            <div style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
                Total: {payloadHistory.length} entries ({completeCount} complete, {chunkCount} chunks) | Total samples: {validSamples.length} | Gaps: {gapCount}
                {hoverData && <span style={{ marginLeft: '15px', color: '#ff6b6b', fontWeight: 'bold' }}>Hovered Value: {hoverData.value}</span>}
                <button
                    onClick={resetZoom}
                    style={{ marginLeft: '15px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', backgroundColor: '#ddd', border: 'none', borderRadius: '4px' }}
                >
                    Reset Zoom
                </button>
                <button
                    onClick={() => setLockScroll(!lockScroll)}
                    style={{ marginLeft: '10px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', backgroundColor: lockScroll ? '#ff6b6b' : '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                    {lockScroll ? '🔓 Unlock' : '🔒 Lock Scroll'}
                </button>
                <span style={{ marginLeft: '10px', fontSize: '12px', color: '#888' }}>
                    (Scroll to zoom, drag to pan)
                </span>
            </div>
            <div style={{ position: 'relative', border: '2px solid #ddd', borderRadius: '8px', padding: '10px', overflow: lockScroll ? 'hidden' : 'visible' }}>
                <svg
                    ref={svgRef}
                    width="100%"
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    style={{ overflow: 'visible', cursor: isDragging ? 'grabbing' : 'grab' }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                >
                    <g transform={transform}>
                        {/* Grid lines - horizontal */}
                        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(p => (
                            <line
                                key={`h-${p}`}
                                x1={padding}
                                y1={padding + p * chartHeight}
                                x2={width - padding}
                                y2={padding + p * chartHeight}
                                stroke="#e0e0e0"
                                strokeWidth="1"
                            />
                        ))}
                        {/* Y-axis labels */}
                        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(p => {
                            const val = maxVal - p * range;
                            return (
                                <text
                                    key={`yl-${p}`}
                                    x={padding - 10}
                                    y={padding + p * chartHeight + 5}
                                    textAnchor="end"
                                    fontSize="11"
                                    fill="#666"
                                >
                                    {val.toFixed(0)}
                                </text>
                            );
                        })}
                        {/* Main lines (split at gaps) */}
                        {polylines.map((lineStr, i) => (
                            <polyline
                                key={`poly-${i}`}
                                points={lineStr}
                                fill="none"
                                stroke="#ff6b6b"
                                strokeWidth="1.5"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        ))}
                        {/* Start markers (green circles for complete, orange for chunks) */}
                        {points.filter(p => p.info?.isStart).map((p, i) => (
                            <circle
                                key={`start-${i}`}
                                cx={p.x}
                                cy={p.y}
                                r="5"
                                fill={p.info.isChunk ? "#ff9800" : "#4caf50"}
                                stroke="white"
                                strokeWidth="2"
                            />
                        ))}
                        {/* End markers (blue circles for complete, orange for chunks) */}
                        {points.filter(p => p.info?.isEnd).map((p, i) => (
                            <circle
                                key={`end-${i}`}
                                cx={p.x}
                                cy={p.y}
                                r="5"
                                fill={p.info.isChunk ? "#ff9800" : "#2196f3"}
                                stroke="white"
                                strokeWidth="2"
                            />
                        ))}
                        {/* Hover indicator line */}
                        {hoverData && (
                            <line
                                x1={hoverData.x / zoom.scale - zoom.offsetX / zoom.scale}
                                y1={padding}
                                x2={hoverData.x / zoom.scale - zoom.offsetX / zoom.scale}
                                y2={height - padding}
                                stroke="#666"
                                strokeWidth="1"
                                strokeDasharray="4"
                            />
                        )}
                        {/* Hover indicator circle */}
                        {hoverData && (
                            <circle
                                cx={hoverData.x / zoom.scale - zoom.offsetX / zoom.scale}
                                cy={hoverData.y / zoom.scale - zoom.offsetY / zoom.scale}
                                r="6"
                                fill="#ff6b6b"
                                stroke="white"
                                strokeWidth="2"
                            />
                        )}
                        {/* Legend */}
                        <text x={padding} y={height - 10} fontSize="12" fill="#666">
                            <tspan fill="#4caf50">●</tspan> Complete Start <tspan dx="5" fill="#2196f3">●</tspan> Complete End <tspan dx="5" fill="#ff9800">●</tspan> Chunk
                        </text>
                    </g>
                </svg>
                {/* Tooltip */}
                {hoverData && (
                    <div
                        style={{
                            position: 'fixed',
                            left: hoverData.screenX + 15,
                            top: hoverData.screenY - 10,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            pointerEvents: 'none',
                            zIndex: 1000,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <div><strong>Value:</strong> {hoverData.value}</div>
                        <div><strong>Time:</strong> {hoverData.info?.time}</div>
                        <div><strong>Type:</strong> {hoverData.info?.isChunk ? 'Chunk' : 'Complete'}</div>
                        <div><strong>Sample Index:</strong> {hoverData.info?.sampleIndex}</div>
                        {hoverData.info?.progress && <div><strong>Progress:</strong> {hoverData.info.progress}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}

function PayloadSamplesChart({ payloadHistory }) {
    const [hoverData, setHoverData] = useState(null);
    const [zoom, setZoom] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [lockScroll, setLockScroll] = useState(false);
    const svgRef = useRef(null);

    // Handle scroll lock with passive: false
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        const handleWheelEvent = (e) => {
            if (lockScroll) {
                e.preventDefault();
                e.stopPropagation();
                // Handle zoom
                const rect = svg.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const scaleAmount = e.deltaY > 0 ? 0.9 : 1.1;
                const newScale = Math.max(0.5, Math.min(10, zoom.scale * scaleAmount));

                const scaleChange = newScale / zoom.scale;
                const newOffsetX = mouseX - (mouseX - zoom.offsetX) * scaleChange;
                const newOffsetY = mouseY - (mouseY - zoom.offsetY) * scaleChange;

                setZoom({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
            }
        };

        svg.addEventListener('wheel', handleWheelEvent, { passive: false });

        return () => {
            svg.removeEventListener('wheel', handleWheelEvent, { passive: false });
        };
    }, [lockScroll, zoom]);

    if (!payloadHistory || payloadHistory.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                No payload data yet. Waiting for sensor messages...
            </div>
        );
    }

    // Get the latest payload with samples
    const latestPayload = payloadHistory[payloadHistory.length - 1];
    const samples = latestPayload.samples || [];

    if (samples.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                No samples in payload.
            </div>
        );
    }

    // Apply moving average smoothing (window size 5)
    const smoothedSamples = samples.map((val, i) => {
        const start = Math.max(0, i - 2);
        const end = Math.min(samples.length, i + 3);
        const window = samples.slice(start, end);
        return window.reduce((a, b) => a + b, 0) / window.length;
    });

    const width = 1000;
    const height = 400;
    const padding = 50;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const minVal = Math.min(...smoothedSamples);
    const maxVal = Math.max(...smoothedSamples);
    const range = maxVal - minVal || 1;

    // Apply zoom transformation
    const transform = `translate(${zoom.offsetX}, ${zoom.offsetY}) scale(${zoom.scale})`;

    // Calculate points for the line using smoothed data
    const points = smoothedSamples.map((val, i) => {
        const x = padding + (i / (smoothedSamples.length - 1 || 1)) * chartWidth;
        const y = padding + chartHeight - ((val - minVal) / range) * chartHeight;
        return { x, y, val, index: i, originalVal: samples[i] };
    });

    const pointsString = points.map(p => `${p.x},${p.y}`).join(' ');

    // Handle mouse wheel zoom
    const handleWheel = (e) => {
        if (lockScroll) {
            e.preventDefault();
            e.stopPropagation();
        }
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const scaleAmount = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.5, Math.min(10, zoom.scale * scaleAmount));

        // Calculate new offset to zoom towards mouse position
        const scaleChange = newScale / zoom.scale;
        const newOffsetX = mouseX - (mouseX - zoom.offsetX) * scaleChange;
        const newOffsetY = mouseY - (mouseY - zoom.offsetY) * scaleChange;

        setZoom({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
    };

    // Handle mouse drag for panning
    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - zoom.offsetX, y: e.clientY - zoom.offsetY });
    };

    // Handle mouse move for tooltip
    const handleMouseMove = (e) => {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const scaleX = width / rect.width;
        const scaleY = height / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        if (isDragging) {
            setZoom({
                ...zoom,
                offsetX: e.clientX - dragStart.x,
                offsetY: e.clientY - dragStart.y
            });
            return;
        }

        // Find closest point (account for zoom)
        let closestPoint = null;
        let minDist = Infinity;

        points.forEach(p => {
            const transformedX = p.x * zoom.scale + zoom.offsetX;
            const dist = Math.abs(transformedX - mouseX);
            if (dist < minDist && dist < 20 / zoom.scale) {
                minDist = dist;
                closestPoint = p;
            }
        });

        if (closestPoint) {
            setHoverData({
                x: closestPoint.x * zoom.scale + zoom.offsetX,
                y: closestPoint.y * zoom.scale + zoom.offsetY,
                value: closestPoint.originalVal,
                smoothedValue: closestPoint.val,
                index: closestPoint.index,
                screenX: e.clientX,
                screenY: e.clientY
            });
        } else {
            setHoverData(null);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
        setHoverData(null);
    };

    const resetZoom = () => {
        setZoom({ scale: 1, offsetX: 0, offsetY: 0 });
    };

    return (
        <div>
            <div style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
                Latest payload: {samples.length} samples | Avg: {latestPayload.avg} | Min: {latestPayload.min} | Max: {latestPayload.max} | Battery: {latestPayload.battery}V
                {hoverData && <span style={{ marginLeft: '15px', color: '#ff6b6b', fontWeight: 'bold' }}>Hovered Value: {hoverData.value}</span>}
                <button
                    onClick={resetZoom}
                    style={{ marginLeft: '15px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', backgroundColor: '#ddd', border: 'none', borderRadius: '4px' }}
                >
                    Reset Zoom
                </button>
                <button
                    onClick={() => setLockScroll(!lockScroll)}
                    style={{ marginLeft: '10px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer', backgroundColor: lockScroll ? '#ff6b6b' : '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                    {lockScroll ? '🔓 Unlock' : '🔒 Lock Scroll'}
                </button>
                <span style={{ marginLeft: '10px', fontSize: '12px', color: '#888' }}>
                    (Scroll to zoom, drag to pan)
                </span>
            </div>
            <div style={{ position: 'relative', border: '2px solid #ddd', borderRadius: '8px', padding: '10px', overflow: lockScroll ? 'hidden' : 'visible' }}>
                <svg
                    ref={svgRef}
                    width="100%"
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    style={{ overflow: 'visible', cursor: isDragging ? 'grabbing' : 'grab' }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                >
                    <g transform={transform}>
                        {/* Grid lines - horizontal */}
                        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(p => (
                            <line
                                key={`h-${p}`}
                                x1={padding}
                                y1={padding + p * chartHeight}
                                x2={width - padding}
                                y2={padding + p * chartHeight}
                                stroke="#e0e0e0"
                                strokeWidth="1"
                            />
                        ))}
                        {/* Grid lines - vertical */}
                        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(p => (
                            <line
                                key={`v-${p}`}
                                x1={padding + p * chartWidth}
                                y1={padding}
                                x2={padding + p * chartWidth}
                                y2={height - padding}
                                stroke="#e0e0e0"
                                strokeWidth="1"
                            />
                        ))}
                        {/* Y-axis labels */}
                        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(p => {
                            const val = maxVal - p * range;
                            return (
                                <text
                                    key={`yl-${p}`}
                                    x={padding - 10}
                                    y={padding + p * chartHeight + 5}
                                    textAnchor="end"
                                    fontSize="11"
                                    fill="#666"
                                >
                                    {val.toFixed(0)}
                                </text>
                            );
                        })}
                        {/* X-axis labels */}
                        {[0, 0.2, 0.4, 0.6, 0.8, 1].map(p => {
                            const idx = Math.floor(p * (samples.length - 1));
                            return (
                                <text
                                    key={`xl-${p}`}
                                    x={padding + p * chartWidth}
                                    y={height - padding + 20}
                                    textAnchor="middle"
                                    fontSize="11"
                                    fill="#666"
                                >
                                    {idx}
                                </text>
                            );
                        })}
                        {/* Main line */}
                        <polyline
                            points={pointsString}
                            fill="none"
                            stroke="#ff6b6b"
                            strokeWidth="2"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                        {/* Data points (show every 5th point to avoid clutter) */}
                        {points.filter((_, i) => i % 5 === 0 || i === points.length - 1).map((p, i) => (
                            <circle
                                key={i}
                                cx={p.x}
                                cy={p.y}
                                r="3"
                                fill="#ff6b6b"
                                stroke="white"
                                strokeWidth="1"
                            />
                        ))}
                        {/* Hover indicator line */}
                        {hoverData && (
                            <line
                                x1={hoverData.x / zoom.scale - zoom.offsetX / zoom.scale}
                                y1={padding}
                                x2={hoverData.x / zoom.scale - zoom.offsetX / zoom.scale}
                                y2={height - padding}
                                stroke="#666"
                                strokeWidth="1"
                                strokeDasharray="4"
                            />
                        )}
                        {/* Hover indicator circle */}
                        {hoverData && (
                            <circle
                                cx={hoverData.x / zoom.scale - zoom.offsetX / zoom.scale}
                                cy={hoverData.y / zoom.scale - zoom.offsetY / zoom.scale}
                                r="6"
                                fill="#ff6b6b"
                                stroke="white"
                                strokeWidth="2"
                            />
                        )}
                        {/* Start and end labels */}
                        <text x={padding} y={padding - 10} fontSize="12" fill="#666">Start</text>
                        <text x={width - padding} y={padding - 10} fontSize="12" fill="#666" textAnchor="end">End</text>
                    </g>
                </svg>
                {/* Tooltip */}
                {hoverData && (
                    <div
                        style={{
                            position: 'fixed',
                            left: hoverData.screenX + 15,
                            top: hoverData.screenY - 10,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            pointerEvents: 'none',
                            zIndex: 1000,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <div><strong>Value:</strong> {hoverData.value}</div>
                        <div><strong>Smoothed:</strong> {hoverData.smoothedValue.toFixed(2)}</div>
                        <div><strong>Sample Index:</strong> {hoverData.index}</div>
                    </div>
                )}
            </div>
        </div>
    );
}

function App() {
    const [isConnected, setIsConnected] = useState(false);
    const [sensorData, setSensorData] = useState(null);
    const [payloadHistory, setPayloadHistory] = useState([]);
    const [error, setError] = useState(null);
    const [messageCount, setMessageCount] = useState(0);
    const [logs, setLogs] = useState([]);

    // Export payload history to CSV (Excel-compatible)
    const exportToExcel = () => {
        if (!payloadHistory || payloadHistory.length === 0) {
            alert('No payload data to export');
            return;
        }

        let csvContent = 'Timestamp,Entry Type,Average,Min,Max,Battery,Sample Index,Sample Value\n';

        payloadHistory.forEach((payload, payloadIndex) => {
            const entryType = payload.isChunk ? 'Chunk' : 'Complete';
            const samples = payload.samples || [];
            
            samples.forEach((sample, sampleIndex) => {
                csvContent += `${payload.time},${entryType},${payload.avg || ''},${payload.min},${payload.max},${payload.battery || ''},${sampleIndex},${sample}\n`;
            });
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `payload_history_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useEffect(() => {
        console.log('Initializing WebSocket connection...');
        console.log('Host:', window.location.host);
        const ws = new WebSocket(`ws://${window.location.host}`);

        ws.onopen = () => {
            console.log('WebSocket connected');
            setIsConnected(true);
            setError(null);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Handle log messages
                if (data.type === 'log') {
                    setLogs(prev => {
                        const newLogs = [...prev, { message: data.message, timestamp: new Date().toLocaleTimeString() }];
                        return newLogs.slice(-200); // Keep last 200 logs
                    });
                    return;
                }
                
                console.log('Received data:', data);
                setSensorData(data);
                setMessageCount(prev => prev + 1);

                // Update payload history if decoded payload exists
                if (data.decodedPayload) {
                    const timestamp = new Date(data.timestamp).toLocaleTimeString();
                    // Handle chunked-dataset format - add chunks as they arrive
                    if (data.decodedPayload.kind === 'chunk' && data.decodedPayload.chunkSamples) {
                        setPayloadHistory(prev => {
                            const newHistory = [...prev, {
                                time: timestamp,
                                samples: data.decodedPayload.chunkSamples,
                                avg: null, // No avg for partial chunk
                                min: Math.min(...data.decodedPayload.chunkSamples),
                                max: Math.max(...data.decodedPayload.chunkSamples),
                                battery: data.decodedPayload.battery || 'N/A',
                                isChunk: true,
                                progress: `${data.decodedPayload.receivedBytes}/${data.decodedPayload.totalBytes} bytes`
                            }];
                            console.log('Payload history (chunk):', newHistory);
                            return newHistory.slice(-100);
                        });
                    }
                    // Handle complete dataset (replace last chunk or add as new)
                    else if (data.decodedPayload.kind === 'dataset' && data.decodedPayload.samples) {
                        setPayloadHistory(prev => {
                            // Remove the chunks that belong to this dataset and add the complete one
                            const newHistory = [...prev];
                            // Keep only non-chunk entries or chunks from other datasets
                            const filtered = newHistory.filter(p => !p.isChunk);
                            const completeEntry = {
                                time: timestamp,
                                samples: data.decodedPayload.samples,
                                avg: data.decodedPayload.avg,
                                min: data.decodedPayload.min,
                                max: data.decodedPayload.max,
                                battery: data.decodedPayload.battery || 'N/A',
                                isChunk: false
                            };
                            filtered.push(completeEntry);
                            console.log('Payload history (dataset complete):', filtered);
                            return filtered.slice(-100);
                        });
                    }
                    // Handle RAK5146 format
                    else if (data.decodedPayload.samples) {
                        setPayloadHistory(prev => {
                            const newHistory = [...prev, {
                                time: timestamp,
                                samples: data.decodedPayload.samples,
                                avg: data.decodedPayload.avg,
                                min: data.decodedPayload.min,
                                max: data.decodedPayload.max,
                                battery: data.decodedPayload.batteryV,
                                isChunk: false
                            }];
                            console.log('Payload history (RAK5146):', newHistory);
                            return newHistory.slice(-100);
                        });
                    }
                }
            } catch (err) {
                console.error('Error parsing message:', err);
                setError('Failed to parse data');
            }
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            setIsConnected(false);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setError('WebSocket connection error');
            setIsConnected(false);
        };

        return () => ws.close();
    }, []);

    return (
        <div className="container">
            <div className="header">
                <h1>
                    LoRaWAN Sensor Dashboard
                    <span className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
                        {isConnected ? '● Connected' : '○ Disconnected'}
                    </span>
                </h1>
                {error && <div style={{ color: 'red', marginTop: '10px', fontSize: '14px' }}>Error: {error}</div>}
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                    Messages received: {messageCount} | Payloads: {payloadHistory.length} | Total samples: {payloadHistory.reduce((sum, p) => sum + (p.samples?.length || 0), 0)}
                </div>
            </div>

            {!sensorData && !error && (
                <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                    <h2>Waiting for sensor data...</h2>
                    <p style={{ color: '#666', marginTop: '10px' }}>
                        {isConnected ? 'Connected to WebSocket. Waiting for device uplinks...' : 'Connecting to WebSocket...'}
                    </p>
                </div>
            )}

            {sensorData && (
                <div className="dashboard">
                    <div className="card">
                        <h2>Device Information</h2>
                        <div className="metric">
                            <span className="metric-label">Device Name</span>
                            <span className="metric-value">{sensorData.deviceName}</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">DevEUI</span>
                            <span className="metric-value">{sensorData.devEui}</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">FPort</span>
                            <span className="metric-value">{sensorData.fPort}</span>
                        </div>
                    </div>

                    <div className="card">
                        <h2>Signal Quality</h2>
                        <div className="metric">
                            <span className="metric-label">RSSI</span>
                            <span className="metric-value">{sensorData.rssi} dBm</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">SNR</span>
                            <span className="metric-value">{sensorData.snr} dB</span>
                        </div>
                        <div className="metric">
                            <span className="metric-label">Last Update</span>
                            <span className="metric-value">{new Date(sensorData.timestamp).toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="card">
                        <h2>Payload Data</h2>
                        <div className="metric">
                            <span className="metric-label">Raw Data</span>
                            <span className="metric-value" style={{ wordBreak: 'break-all' }}>{sensorData.data || 'N/A'}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="chart-container" style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h2 style={{ margin: 0 }}>Payload Samples History (with gaps)</h2>
                    <button 
                        onClick={exportToExcel}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }}
                    >
                        Export to Excel
                    </button>
                </div>
                <PayloadSamplesHistoryChart payloadHistory={payloadHistory} />
            </div>

            <div className="chart-container" style={{ marginTop: '20px' }}>
                <h2>Payload Samples (Latest)</h2>
                <PayloadSamplesChart payloadHistory={payloadHistory} />
            </div>

            <div className="chart-container" style={{ marginTop: '20px' }}>
                <h2>Server Console Logs</h2>
                <div style={{ 
                    backgroundColor: '#1e1e1e', 
                    color: '#d4d4d4', 
                    padding: '15px', 
                    borderRadius: '5px', 
                    fontFamily: 'monospace', 
                    fontSize: '12px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                }}>
                    {logs.length === 0 ? (
                        <div style={{ color: '#666' }}>Waiting for logs...</div>
                    ) : (
                        logs.map((log, i) => (
                            <div key={i} style={{ marginBottom: '2px' }}>
                                <span style={{ color: '#888' }}>[{log.timestamp}]</span> {log.message}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
