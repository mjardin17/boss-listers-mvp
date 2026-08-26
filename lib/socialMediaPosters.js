// Platform-specific video posting adapters
// Each platform has its own API and requirements

const POSTERS = {
  async instagram(videoBuffer, caption, accessToken) {
    // Instagram: Upload via Media endpoint, then publish via IG Container
    const formData = new FormData();
    formData.append("video_data", new Blob([videoBuffer], { type: "video/mp4" }));
    formData.append("description", caption);
    formData.append("access_token", accessToken);

    const uploadRes = await fetch("https://graph.instagram.com/v18.0/me/media", {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) throw new Error(`Instagram upload failed: ${await uploadRes.text()}`);
    const media = await uploadRes.json();

    return { platform: "instagram", mediaId: media.id, url: `https://instagram.com/reel/${media.id}` };
  },

  async tiktok(videoBuffer, caption, accessToken) {
    // TikTok: Upload to /video/upload and publish
    const formData = new FormData();
    formData.append("video", new Blob([videoBuffer], { type: "video/mp4" }));
    formData.append("description", caption);

    const uploadRes = await fetch("https://open.tiktokapi.com/v1/video/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    if (!uploadRes.ok) throw new Error(`TikTok upload failed: ${await uploadRes.text()}`);
    const data = await uploadRes.json();

    return { platform: "tiktok", videoId: data.data.video_id, url: `https://tiktok.com/@user/video/${data.data.video_id}` };
  },

  async youtube(videoBuffer, caption, accessToken) {
    // YouTube: Upload via resumable upload protocol
    const formData = new FormData();
    formData.append("video", new Blob([videoBuffer], { type: "video/mp4" }));

    const metadata = {
      snippet: {
        title: caption.split("\n")[0].slice(0, 100),
        description: caption,
        tags: caption.match(/#\w+/g) || [],
      },
      status: { privacyStatus: "public" },
    };
    formData.append("metadata", JSON.stringify(metadata));

    const uploadRes = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet,status&uploadType=multipart", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    if (!uploadRes.ok) throw new Error(`YouTube upload failed: ${await uploadRes.text()}`);
    const data = await uploadRes.json();

    return { platform: "youtube", videoId: data.id, url: `https://youtube.com/shorts/${data.id}` };
  },

  async facebook(videoBuffer, caption, accessToken) {
    // Facebook: POST to /me/videos with video attachment
    const formData = new FormData();
    formData.append("source", new Blob([videoBuffer], { type: "video/mp4" }));
    formData.append("description", caption);
    formData.append("access_token", accessToken);

    const uploadRes = await fetch("https://graph.facebook.com/v18.0/me/videos", {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) throw new Error(`Facebook upload failed: ${await uploadRes.text()}`);
    const data = await uploadRes.json();

    return { platform: "facebook", videoId: data.id, url: `https://facebook.com/video/${data.id}` };
  },

  async twitter(videoBuffer, caption, accessToken) {
    // Twitter: Upload media first, then post tweet
    const mediaFormData = new FormData();
    mediaFormData.append("media_data", Buffer.from(videoBuffer).toString("base64"));

    const mediaRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: mediaFormData,
    });

    if (!mediaRes.ok) throw new Error(`Twitter media upload failed`);
    const media = await mediaRes.json();

    const tweetRes = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: caption,
        media: { media_ids: [media.media_id_string] },
      }),
    });

    if (!tweetRes.ok) throw new Error(`Twitter tweet failed`);
    const tweet = await tweetRes.json();

    return { platform: "twitter", tweetId: tweet.data.id, url: `https://twitter.com/user/status/${tweet.data.id}` };
  },

  async linkedin(videoBuffer, caption, accessToken) {
    // LinkedIn: Upload via /videos endpoint
    const uploadRes = await fetch("https://api.linkedin.com/v2/videos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uploadMechanism: { com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest: {} },
        owner: "urn:li:person:me",
      }),
    });

    if (!uploadRes.ok) throw new Error(`LinkedIn upload failed`);
    const uploadData = await uploadRes.json();

    return { platform: "linkedin", videoId: uploadData.value, url: `https://linkedin.com/video/${uploadData.value}` };
  },

  async snapchat(videoBuffer, caption, accessToken) {
    // Snapchat Spotlight: Upload via /media/upload
    const formData = new FormData();
    formData.append("file", new Blob([videoBuffer], { type: "video/mp4" }));

    const uploadRes = await fetch("https://adsapi.snapchat.com/v1/media/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    if (!uploadRes.ok) throw new Error(`Snapchat upload failed`);
    const data = await uploadRes.json();

    return { platform: "snapchat", mediaId: data.data.id, url: `https://snapchat.com/spotlight/${data.data.id}` };
  },

  async pinterest(videoBuffer, caption, accessToken) {
    // Pinterest: Create pin with video
    const uploadRes = await fetch("https://api.pinterest.com/v1/pins", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        board: "my-board",
        note: caption,
        media: { data: Buffer.from(videoBuffer).toString("base64") },
      }),
    });

    if (!uploadRes.ok) throw new Error(`Pinterest upload failed`);
    const data = await uploadRes.json();

    return { platform: "pinterest", pinId: data.id, url: `https://pinterest.com/pin/${data.id}` };
  },
};

async function postToSocialMedia(platform, videoBuffer, caption, accessToken) {
  const poster = POSTERS[platform];
  if (!poster) throw new Error(`No poster for platform: ${platform}`);

  try {
    return await poster(videoBuffer, caption, accessToken);
  } catch (err) {
    return { platform, error: err.message, success: false };
  }
}

module.exports = {
  POSTERS,
  postToSocialMedia,
};
