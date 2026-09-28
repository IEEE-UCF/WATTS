/**
 * IEEE Member Scanner Hook
 *
 * Custom React hook that provides QR code scanning functionality for IEEE member check-in.
 * This hook manages all the business logic and state for the scanner, keeping it separate
 * from the UI components.
 *
 * Dependencies:
 * - React hooks (useState)
 *
 * Usage:
 * const scanner = useMemberScanner();
 * // Access: scanner.isScanning, scanner.handleScan(), etc.
 */

'use client';
import { useRef, useState } from 'react';

/**
 * Interface for scanned member data
 *
 * @property {string} id - The member's unique ID (from QR code)
 * @property {string} timestamp - When the member was scanned (for check-in record)
 * @property {any} data - Optional additional member data (name, chapter, etc.)
 * @property {number} scanId - Unique per scan, so a rescan of the same member is a new value
 */
export interface ScannedMember {
	id: string;
	timestamp: string;
	data?: any;
	scanId: number;
}

export interface MemberScannerOptions {
	/** Keep the camera running after each scan instead of stopping on a result. */
	continuous?: boolean;
}

/** In continuous mode, the same code held in front of the camera is ignored for this long. */
const REPEAT_SCAN_WINDOW_MS = 3000;

/**
 * Custom hook for IEEE member QR code scanning
 *
 * Manages all state and logic for scanning member QR codes:
 * - Scanner on/off state
 * - Scanned data processing (JSON parsing)
 * - Member check-in history
 * - Error handling
 * - Haptic feedback
 *
 * @returns {Object} Scanner state and methods
 */
export function useMemberScanner({ continuous = false }: MemberScannerOptions = {}) {
	// ============================================
	// STATE MANAGEMENT
	// ============================================

	/**
	 * Controls whether the camera scanner is active
	 * - true: Camera is active and scanning
	 * - false: Camera is off, showing results or idle
	 */
	const [isScanning, setIsScanning] = useState(true);

	/**
	 * Stores the raw string data from the scanned QR code
	 * Used for debugging and displaying what was scanned
	 */
	const [scannedData, setScannedData] = useState<string>('');

	/**
	 * Stores the currently scanned member's information
	 * - null: No member scanned yet
	 * - ScannedMember: Contains member ID, timestamp, and optional data
	 */
	const [memberInfo, setMemberInfo] = useState<ScannedMember | null>(null);

	/**
	 * Stores error messages (e.g., camera permission denied)
	 * Empty string means no error
	 */
	const [error, setError] = useState<string>('');

	/**
	 * Array of all members scanned during this session
	 * Newest scans are added to the beginning of the array
	 * Used to display check-in history
	 */
	const [scanHistory, setScanHistory] = useState<ScannedMember[]>([]);

	/** Last member id seen and when, for ignoring repeat reads in continuous mode */
	const lastScan = useRef<{ id: string; at: number } | null>(null);
	const nextScanId = useRef(0);

	// ============================================
	// EVENT HANDLERS
	// ============================================

	/**
	 * Handles successful QR code scan
	 *
	 * This function is called by the Scanner component when a QR code is detected.
	 * It processes the scanned data and updates the state accordingly.
	 *
	 * @param {any} result - Result object from the scanner containing the decoded QR data
	 *                       Structure: [{ rawValue: "string data from QR code" }]
	 *
	 * Flow:
	 * 1. Extracts raw string from QR code
	 * 2. Tries to parse as JSON (for structured member data)
	 * 3. Creates member record with ID and timestamp
	 * 4. Adds to scan history
	 * 5. Stops scanner to show results (unless continuous)
	 * 6. Triggers haptic feedback (if device supports it)
	 */
	const handleScan = (result: any) => {
		// Check if we got valid scan data
		if (result && result.length > 0) {
			// Extract the actual string data from the QR code
			const rawValue = result[0].rawValue;

			// Try to parse the QR code data as JSON
			// Our QR generator creates JSON like: {"id":"123","name":"John","chapter":"UCF"}
			// If parsing fails, the QR code is plain text and the whole string is the member ID
			let parsedData: any;
			try {
				parsedData = JSON.parse(rawValue);
			} catch {
				parsedData = undefined;
			}
			const id: string = parsedData?.id || rawValue;

			// The camera reports the same code many times while it's held up; in continuous
			// mode only the first read within the window counts.
			const now = Date.now();
			if (
				continuous &&
				lastScan.current?.id === id &&
				now - lastScan.current.at < REPEAT_SCAN_WINDOW_MS
			) {
				return;
			}
			lastScan.current = { id, at: now };

			setScannedData(rawValue);
			setError('');

			const member: ScannedMember = {
				id,
				timestamp: new Date().toLocaleString(), // Current time for check-in record
				data: parsedData, // Store all the JSON data for display
				scanId: ++nextScanId.current,
			};

			// Update state with the scanned member, and add to history (newest first)
			setMemberInfo(member);
			setScanHistory((prev) => [member, ...prev]);

			// Stop scanning to show the result screen
			if (!continuous) setIsScanning(false);

			// Provide haptic feedback on mobile devices (vibration)
			// This gives tactile confirmation that scan was successful
			if (navigator.vibrate) {
				navigator.vibrate(200); // Vibrate for 200ms
			}
		}
	};

	/**
	 * Handles camera/scanner errors
	 *
	 * Common errors:
	 * - User denied camera permission
	 * - Camera not available (no camera on device)
	 * - Camera in use by another application
	 *
	 * @param {any} error - Error object from the scanner
	 */
	const handleError = (err: any) => {
		console.error('QR Scanner Error:', err);
		setError('Camera access denied or not available');
	};

	/**
	 * Resets the scanner to scan another member
	 *
	 * Clears the current scan result and reactivates the camera.
	 * Used after successfully checking in a member.
	 */
	const resetScanner = () => {
		setScannedData('');
		setMemberInfo(null);
		setError('');
		lastScan.current = null;
		setIsScanning(true); // Reactivate camera
	};

	/**
	 * Clears all check-in history
	 *
	 * Removes all scanned members from the session history.
	 * Does not affect the current scan or scanner state.
	 */
	const clearHistory = () => {
		setScanHistory([]);
	};

	// ============================================
	// RETURN PUBLIC API
	// ============================================

	/**
	 * Returns all state and methods needed by the UI
	 * This is the public API of the hook
	 */
	return {
		// State
		isScanning,
		scannedData,
		memberInfo,
		error,
		scanHistory,

		// Methods
		handleScan,
		handleError,
		resetScanner,
		clearHistory,
		setIsScanning,
	};
}
