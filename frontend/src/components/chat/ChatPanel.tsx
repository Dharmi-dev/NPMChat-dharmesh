'use client'
import React, { useRef, useEffect, useState } from 'react'
import { useMessageContext } from '../../app/MessageContext'
import { useAuth } from '../../app/AuthContext'
import { BASES } from '../../app/fetcher'
import EmojiPicker from 'emoji-picker-react'
import { ModeToggle } from '../ui/mode-toggle'
import ProgressBar from '../chat/ProgressBar'

export default function ChatPanel({
	selectedUser,
	onBack,
}: {
	selectedUser: any
	onBack: () => void
}) {
	const {
		messages,
		sendMessage,
		markAsSeen,
		loadingMessages,
		error,
		selectedUser: contextSelectedUser,
	} = useMessageContext()
	const { user } = useAuth()
	const [input, setInput] = useState('')
	const messageEndRef = useRef<HTMLDivElement | null>(null)
	const currentUserId = user?.id
	const [showEmoji, setShowEmoji] = useState(false)
	const [image, setImage] = useState<string | null>(null)
	const [enlargedImage, setEnlargedImage] = useState<string | null>(null)
	const [showUserDetails, setShowUserDetails] = useState(false)
	const [uploadingFile, setUploadingFile] = useState<{
		file: File
		progress: number
		uploadId: string
	} | null>(null)
	const [uploadProgress, setUploadProgress] = useState(0)

	function getFileIcon(mimetype: string) {
		if (mimetype.startsWith('image/')) return '🖼️'
		if (mimetype === 'application/pdf') return '📄'
		if (mimetype.includes('word') || mimetype.includes('document')) return '📝'
		if (mimetype.includes('zip') || mimetype.includes('compressed')) return '📦'
		if (mimetype.startsWith('text/')) return '📄'
		return '📁'
	}

	function formatFileSize(bytes: number) {
		if (bytes === 0) return '0 Bytes'
		const k = 1024
		const sizes = ['Bytes', 'KB', 'MB', 'GB']
		const i = Math.floor(Math.log(bytes) / Math.log(k))
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
	}

	useEffect(() => {
		messageEndRef.current?.scrollIntoView({ behavior: 'auto' })
	}, [messages, selectedUser])

	useEffect(() => {
		// Mark unseen messages as seen when displayed
		messages.forEach((msg: any) => {
			if (!msg.seen && msg.receiverId === currentUserId) {
				markAsSeen(msg._id)
			}
		})
		// eslint-disable-next-line
	}, [messages, selectedUser])

	async function handleSend() {
		if ((input.trim() === '' && !image) || !selectedUser) return
		await sendMessage(selectedUser._id, input, image || undefined, undefined)
		setInput('')
		setImage(null)
	}

	function addEmoji(emoji: any) {
		setInput((prev) => prev + emoji.native)
		setShowEmoji(false)
	}

	function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0]
		if (file) {
			const reader = new FileReader()
			reader.onload = (ev) => {
				setImage(ev.target?.result as string)
			}
			reader.readAsDataURL(file)
		}
	}

	const handleFileUpload = async (file: File) => {
		if (!selectedUser) return

		console.log('File selected:', {
			name: file.name,
			type: file.type,
			size: file.size,
		})

		// Validate file size (5MB limit)
		const MAX_SIZE = 5 * 1024 * 1024 // 5MB
		if (file.size > MAX_SIZE) {
			alert('File size must be less than 5MB')
			return
		}

		// Validate file type
		const allowedTypes = [
			'application/pdf',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'application/zip',
			'application/x-zip-compressed',
			'text/plain',
			'text/csv',
			'application/json',
			'image/jpeg',
			'image/jpg',
			'image/png',
			'image/gif',
		]

		console.log('File type check:', {
			fileType: file.type,
			isAllowed: allowedTypes.includes(file.type),
			allowedTypes: allowedTypes,
		})

		if (!allowedTypes.includes(file.type)) {
			alert(
				`File type "${file.type}" not supported. Please upload PDF, DOC, DOCX, ZIP, TXT, CSV, JSON, or image files.`
			)
			return
		}

		const uploadId = Date.now().toString()
		setUploadingFile({ file, progress: 0, uploadId })

		try {
			const formData = new FormData()
			formData.append('file', file)

			const xhr = new XMLHttpRequest()

			// Create a promise to handle the upload
			const uploadPromise = new Promise<any>((resolve, reject) => {
				xhr.upload.addEventListener('progress', (event) => {
					if (event.lengthComputable) {
						const progress = (event.loaded / event.total) * 100
						setUploadingFile((prev) =>
							prev ? { ...prev, progress } : null
						)
					}
				})

				xhr.addEventListener('load', () => {
					if (xhr.status === 200) {
						try {
							const response = JSON.parse(xhr.responseText)
							resolve(response)
						} catch (e) {
							reject(new Error('Invalid response format'))
						}
					} else {
						reject(new Error(`Upload failed with status ${xhr.status}`))
					}
				})

				xhr.addEventListener('error', () => {
					reject(new Error('Network error during upload'))
				})

				xhr.addEventListener('abort', () => {
					reject(new Error('Upload cancelled'))
				})
			})

			xhr.open('POST', `http://localhost:8080/api/files/upload`)

			// Add auth token if available
			const token = localStorage.getItem('token')
			if (token) {
				xhr.setRequestHeader('Authorization', `Bearer ${token}`)
			}

			xhr.send(formData)

			const response = await uploadPromise

			// Send file message via socket
			await sendMessage('', selectedUser._id, undefined, {
				url: response.url,
				filename: response.filename,
				size: response.size,
				mimetype: response.mimetype,
			})

			// Show success animation
			setUploadingFile((prev) => (prev ? { ...prev, progress: 100 } : null))

			// Clear upload state after short delay
			setTimeout(() => {
				setUploadingFile(null)
			}, 1500)
		} catch (error) {
			console.error('File upload error:', error)
			alert(`Upload failed: ${error.message}`)
			setUploadingFile(null)
		}
	}

	const cancelUpload = () => {
		setUploadingFile(null)
		// Note: In a real implementation, you'd also abort the XMLHttpRequest
	}

	return (
		<main className='flex flex-col flex-1 h-full bg-white'>
			{/* User Details Modal */}
			{showUserDetails && selectedUser && (
				<div
					className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'
					onClick={() => setShowUserDetails(false)}
				>
					<div
						className='bg-white rounded-2xl border-2 border-sidebar-border  shadow-lg p-0 flex flex-col items-center gap-0 relative min-w-[340px] max-w-xs'
						onClick={(e) => e.stopPropagation()}
					>
						<button
							className='absolute top-2 right-2 text-2xl font-bold text-black hover:text-[#39ff14]'
							onClick={() => setShowUserDetails(false)}
							aria-label='Close'
						>
							×
						</button>
						<div className='flex flex-col items-center w-full pt-8 pb-4 px-6'>
							<img
								src={
									selectedUser.avatarUrl ||
									'/public/avatar.png'
								}
								alt={selectedUser.name}
								className='w-28 h-28 rounded-full border-4 border-[#b39ddb] object-cover shadow-md mb-3'
							/>
							<span className='text-2xl font-extrabold text-black mb-1'>
								{selectedUser.name}
							</span>
							<div className='flex items-center gap-2 mb-2'>
								<span
									className={`w-3 h-3 rounded-full border-2 border-sidebar-border  ${
										selectedUser.status === 'online'
											? 'bg-[#39ff14]'
											: 'bg-gray-400'
									}`}
								></span>
								<span
									className={`text-sm font-bold ${
										selectedUser.status === 'online'
											? 'text-[#39ff14]'
											: 'text-gray-400'
									}`}
								>
									{selectedUser.status === 'online'
										? 'Online'
										: 'Offline'}
								</span>
							</div>
							<div className='w-full border-t border-gray-200 my-2'></div>
							{selectedUser.bio && (
								<div className='w-full bg-[#f3e8ff] border border-[#b39ddb] rounded-lg px-4 py-2 text-center text-gray-700 text-base mt-2'>
									{selectedUser.bio}
								</div>
							)}
						</div>
					</div>
				</div>
			)}
			{/* Image Modal */}
			{enlargedImage && (
				<div
					className='fixed inset-0 z-50 flex items-center justify-center bg-black/70'
					onClick={() => setEnlargedImage(null)}
				>
					<div className='relative'>
						<img
							src={enlargedImage}
							alt='enlarged'
							className='max-w-[90vw] max-h-[80vh] rounded-lg border-4 border-white shadow-lg'
						/>
						<button
							className='absolute top-2 right-2 bg-white border border-sidebar-border  rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold'
							onClick={(e) => {
								e.stopPropagation()
								setEnlargedImage(null)
							}}
							aria-label='Close image'
						>
							×
						</button>
						<a
							href={enlargedImage}
							download='image.jpg'
							className='absolute bottom-2 right-2 bg-white border border-sidebar-border  rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold'
							onClick={(e) => e.stopPropagation()}
							aria-label='Download image'
						>
							⬇️
						</a>
					</div>
				</div>
			)}
			{/* Header */}
			<div className='flex items-center gap-3 px-4 py-3 border-b-2 border-sidebar-border bg-background sticky top-0 z-10'>
				{/* Back button for mobile */}
				<button
					className='md:hidden mr-2 p-2 rounded-full border-2 border-sidebar-border bg-[#b39ddb] hover:bg-[#39ff14] focus:outline-none'
					onClick={onBack}
					aria-label='Back to user list'
					tabIndex={-1}
				>
					<svg
						xmlns='http://www.w3.org/2000/svg'
						fill='none'
						viewBox='0 0 24 24'
						strokeWidth={2}
						stroke='currentColor'
						className='w-6 h-6'
					>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							d='M15 19l-7-7 7-7'
						/>
					</svg>
				</button>
				<div
					className='w-10 h-10 rounded-full bg-[#b39ddb] flex items-center justify-center text-xl font-extrabold border-2 border-sidebar-border cursor-pointer hover:opacity-80'
					onClick={() => setShowUserDetails(true)}
					title='View profile'
				>
					{selectedUser && selectedUser.avatarUrl ? (
						<img
							src={selectedUser.avatarUrl}
							alt={selectedUser.name || 'User'}
							className='w-full h-full object-cover rounded-full'
						/>
					) : selectedUser && selectedUser.name ? (
						selectedUser.name[0]
					) : (
						'?'
					)}
				</div>
				<div className='flex justify-between w-full px-2'>
					<div className='flex flex-col'>
						<span
							className='text-lg font-extrabold text-primary cursor-pointer hover:text-[#39ff14]'
							onClick={() => setShowUserDetails(true)}
							title='View profile'
						>
							{selectedUser && selectedUser.name
								? selectedUser.name
								: 'User'}
						</span>
						<span className='text-xs font-bold text-[#39ff14]'>
							{selectedUser && selectedUser.status
								? selectedUser.status
								: ''}
						</span>
					</div>
					<ModeToggle />
				</div>
			</div>
			{/* Messages */}
			<div className='flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#f3e8ff] dark:bg-accent'>
				{messages.map((msg: any, i: number) => {
					const isMe = msg.senderId === currentUserId
					// Format time from createdAt or timestamp
					let time = ''
					const timeSource = msg.createdAt || msg.timestamp
					if (timeSource) {
						const date = new Date(timeSource)
						time = date.toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
						})
					}
					return (
						<div
							key={msg._id || i}
							className={`flex w-full ${
								isMe ? 'justify-end' : 'justify-start'
							}`}
						>
							<div
								className={`relative max-w-xs md:max-w-md px-0 py-0 rounded-2xl border-2 font-medium text-base flex flex-col gap-1 shadow-sm
                ${
					isMe
						? 'bg-[#39ff14] text-black border-[#b39ddb] rounded-br-none items-end'
						: 'bg-white text-black border-[#39ff14] rounded-bl-none items-start'
				}`}
							>
								{msg.image && (
									<div className='relative group rounded-xl overflow-hidden m-2'>
										<img
											src={msg.image}
											alt='preview'
											className='w-60 h-60 object-cover rounded-xl border border-black cursor-pointer hover:opacity-90 transition'
											onClick={() =>
												setEnlargedImage(msg.image)
											}
											style={{
												boxShadow:
													'0 2px 8px rgba(0,0,0,0.10)',
											}}
										/>
										<a
											href={msg.image}
											download='image.jpg'
											className='absolute bottom-2 right-2 bg-white/80 border border-black rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold opacity-80 hover:opacity-100 transition'
											onClick={(e) => e.stopPropagation()}
											title='Download image'
										>
											⬇️
										</a>
									</div>
								)}
								{msg.file && (
									<div className='bg-gray-50 border border-gray-200 rounded-lg p-3 max-w-sm'>
										<div className='flex items-center space-x-3'>
											<div className='flex-shrink-0'>
												<div className='w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center'>
													{getFileIcon(msg.file.mimetype)}
												</div>
											</div>
											<div className='flex-1 min-w-0'>
												<p className='text-sm font-medium text-gray-900 truncate'>
													{msg.file.filename}
												</p>
												<p className='text-xs text-gray-500'>
													{formatFileSize(msg.file.size)}
												</p>
											</div>
											<div className='flex-shrink-0'>
												<a
													href={`http://localhost:8080${msg.file.url}`}
													download={msg.file.filename}
													className='inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-full text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors'
												>
													<svg
														className='w-3 h-3 mr-1'
														fill='currentColor'
														viewBox='0 0 20 20'
													>
														<path
															fillRule='evenodd'
															d='M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z'
															clipRule='evenodd'
														/>
													</svg>
													Download
												</a>
											</div>
										</div>
									</div>
								)}
								{msg.text && (
									<span className='px-4 pb-1 pt-1 break-words text-base text-black'>
										{msg.text}
									</span>
								)}
								<span className='flex items-center gap-1 text-xs text-gray-500 mt-1 self-end pr-3 pb-1'>
									{time}
								</span>
							</div>
						</div>
					)
				})}
				<div ref={messageEndRef} />
			</div>
			{/* Upload Progress Bar */}
			{uploadingFile && (
				<ProgressBar
					progress={uploadingFile.progress}
					fileName={uploadingFile.file.name}
					fileSize={uploadingFile.file.size}
					onCancel={cancelUpload}
				/>
			)}
			{/* Input */}
			<form
				className='flex items-center gap-2 border-t-2 border-sidebar-border  px-2 py-2 bg-background sticky bottom-0 z-10 relative'
				onSubmit={(e) => {
					e.preventDefault()
					handleSend()
				}}
			>
				<button
					type='button'
					className='px-2 py-2 text-xl border-2 border-sidebar-border  rounded-full bg-accent  hover:bg-[#b39ddb]'
					onClick={() => setShowEmoji((v) => !v)}
					aria-label='Add emoji'
				>
					😊
				</button>
				{showEmoji && (
					<div className='absolute bottom-14 left-0 z-50'>
						<EmojiPicker
							onEmojiClick={(emojiData) => {
								setInput((prev) => prev + emojiData.emoji)
								setShowEmoji(false)
							}}
						/>
					</div>
				)}
				<label
					className='px-2 py-2 cursor-pointer border-2 border-sidebar-border rounded-full bg-accent hover:bg-[#b39ddb] flex items-center justify-center'
					title='Attach image'
				>
					<input
						type='file'
						accept='image/*'
						className='hidden'
						onChange={handleImageChange}
					/>
					<span role='img' aria-label='Attach'>
						📎
					</span>
				</label>
				<label
					className='px-2 py-2 cursor-pointer border-2 border-sidebar-border rounded-full bg-accent hover:bg-[#b39ddb] flex items-center justify-center'
					title='Attach file'
				>
					<input
						type='file'
						accept='.pdf,.doc,.docx,.zip,.txt,.csv,.json,.jpg,.jpeg,.png,.gif'
						className='hidden'
						onChange={(e) => {
							const file = e.target.files?.[0]
							if (file) {
								handleFileUpload(file)
							}
						}}
						disabled={uploadingFile !== null}
					/>
					<span role='img' aria-label='Attach file'>
						📄
					</span>
				</label>
				{image && (
					<div className='relative flex items-center'>
						<img
							src={image}
							alt='preview'
							className='w-12 h-12 object-cover rounded border-2 border-sidebar-border  mr-2'
						/>
						<button
							type='button'
							className='absolute top-0 right-0 bg-white border border-sidebar-border  rounded-full w-5 h-5 flex items-center justify-center text-xs'
							onClick={() => setImage(null)}
							aria-label='Remove image'
						>
							×
						</button>
					</div>
				)}
				<input
					type='text'
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder='Type a message...'
					className='flex-1 px-3 py-2 border-2 border-sidebar-border  rounded-full font-medium text-base bg-[#f3e8ff] dark:bg-accent text-primary focus:bg-white focus:outline-none focus:border-[#39ff14] placeholder:text-gray-400'
				/>
				<button
					type='submit'
					className='px-4 py-2 bg-[#39ff14] text-black text-base font-bold rounded-full border-2 border-sidebar-border  transition-all duration-100 hover:bg-[#b39ddb] hover:text-white hover:scale-105 shadow-sm'
				>
					Send
				</button>
			</form>
			{loadingMessages && (
				<div className='p-4 text-center'>Loading messages...</div>
			)}
			{error && (
				<div className='p-4 text-center text-red-500'>{error}</div>
			)}
		</main>
	)
}
