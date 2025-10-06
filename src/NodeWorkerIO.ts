/**
 * Node.js worker_threads compatible IO adapters for kkrpc
 * These adapters bridge Node.js worker_threads API with kkrpc's interface
 */

import type { DestroyableIoInterface } from "@kunkun/kkrpc"

const DESTROY_SIGNAL = "__DESTROY__"

/**
 * IO adapter for Node.js worker_threads parent side
 */
export class NodeWorkerParentIO implements DestroyableIoInterface {
	name = "node-worker-parent-io"
	private messageQueue: string[] = []
	private resolveRead: ((value: string | null) => void) | null = null
	private worker: any

	constructor(worker: any) {
		this.worker = worker
		this.worker.on("message", this.handleMessage)
	}

	private handleMessage = (message: any) => {
		// Handle destroy signal
		if (message === DESTROY_SIGNAL) {
			this.destroy()
			return
		}

		if (this.resolveRead) {
			// If there's a pending read, resolve it immediately
			this.resolveRead(message)
			this.resolveRead = null
		} else {
			// Otherwise, queue the message
			this.messageQueue.push(message)
		}
	}

	read(): Promise<string | null> {
		// If there are queued messages, return the first one
		if (this.messageQueue.length > 0) {
			return Promise.resolve(this.messageQueue.shift() ?? null)
		}

		// Otherwise, wait for the next message
		return new Promise((resolve) => {
			this.resolveRead = resolve
		})
	}

	write(data: string): Promise<void> {
		this.worker.postMessage(data)
		return Promise.resolve()
	}

	destroy(): void {
		this.worker.postMessage(DESTROY_SIGNAL)
		this.worker.terminate()
	}

	signalDestroy(): void {
		this.worker.postMessage(DESTROY_SIGNAL)
	}
}

/**
 * IO adapter for Node.js worker_threads child side
 */
export class NodeWorkerChildIO implements DestroyableIoInterface {
	name = "node-worker-child-io"
	private messageQueue: string[] = []
	private resolveRead: ((value: string | null) => void) | null = null
	private parentPort: any

	constructor() {
		// Dynamically import parentPort from worker_threads
		// @ts-ignore - Dynamic require for Node.js compatibility
		const { parentPort } = require("worker_threads")
		
		if (!parentPort) {
			throw new Error("NodeWorkerChildIO must be used inside a Node.js worker thread")
		}
		
		this.parentPort = parentPort
		this.parentPort.on("message", this.handleMessage)
	}

	private handleMessage = (message: any) => {
		// Handle destroy signal
		if (message === DESTROY_SIGNAL) {
			this.destroy()
			return
		}

		if (this.resolveRead) {
			this.resolveRead(message)
			this.resolveRead = null
		} else {
			this.messageQueue.push(message)
		}
	}

	async read(): Promise<string | null> {
		if (this.messageQueue.length > 0) {
			return this.messageQueue.shift() ?? null
		}

		return new Promise((resolve) => {
			this.resolveRead = resolve
		})
	}

	async write(data: string): Promise<void> {
		this.parentPort.postMessage(data)
	}

	destroy(): void {
		this.parentPort.postMessage(DESTROY_SIGNAL)
		// Note: workers don't have a close() method in Node.js
		// The worker will be terminated by the parent
	}

	signalDestroy(): void {
		this.parentPort.postMessage(DESTROY_SIGNAL)
	}
}

