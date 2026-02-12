import { createClient } from './client'

const BUCKET = 'tdb-images'

/**
 * 채팅용 이미지를 tdb-images 버킷에 업로드하고 공개 URL 반환
 */
export async function uploadChatImage(
  file: File,
  boardId: string
): Promise<string | null> {
  const supabase = createClient()
  if (!supabase) return null

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg'
  const path = `${boardId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) {
    console.error('uploadChatImage error:', error)
    return null
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return urlData.publicUrl
}
