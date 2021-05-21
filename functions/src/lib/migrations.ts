import axios from 'axios'
import { firestore as db } from '../firebase'

export async function getDocs(collection: FirebaseFirestore.Query) {
  return (await collection.get()).docs.map(
    (doc) =>
      ({
        ...doc.data(),
        id: doc.id
      } as any)
  )
}

export async function migrateFavs() {
  const posts = await getDocs(db.collection('posts'))

  for (const post of posts) {
    const savedBy = post.savedBy || {}

    const before = Object.keys(savedBy).length

    const responses = await getDocs(
      db.collection('participants').where('eventId', '==', post.id)
    )

    for (const r of responses) {
      if (r.collection === 'posts' && r.rsvp === 'up') {
        savedBy[r.uid] = true
      }
    }

    delete savedBy['null']

    const after = Object.keys(savedBy).length

    await db
      .collection('posts')
      .doc(post.id)
      .update({ savedBy })

    console.log({ title: post.title, before, after })
  }
}

export async function migrateUsernames() {
  const posts = await getDocs(db.collection('posts'))

  for (const post of posts) {
    const username = (
      await db
        .collection('profiles')
        .doc(post.createdBy)
        .get()
    ).data()?.username

    if (username) {
      await db
        .collection('posts')
        .doc(post.id)
        .update({ username })
    }

    console.log({ type: 'post', title: post.title, username, id: post.id })
  }

  const events = await getDocs(db.collection('events'))

  for (const event of events) {
    const username = (
      await db
        .collection('profiles')
        .doc(event.createdBy)
        .get()
    ).data()?.username

    if (username) {
      await db
        .collection('events')
        .doc(event.id)
        .update({ username })
    }

    console.log({ type: 'event', name: event.name, username, id: event.id })
  }
}

export async function migrateShares() {
  const shares = (
    await getDocs(db.collection('shares').where('collection', '==', 'profiles'))
  ).map((i) => i.contentId)

  const profiles = await getDocs(
    db.collection('profiles').where('permission', '==', 'Yes')
  )

  for (const profile of profiles) {
    if (shares.includes(profile.id)) {
      console.log('skipped', profile.username)
      continue
    }

    if (!profile.place) {
      console.log('missing city', profile.username)
      continue
    }

    console.log('add', profile.username)
    await generateSocialCover(profile)
  }
}

export async function generateSocialCover(profile: any) {
  const result = await axios.get(
    `https://us-central1-wedance-4abe3.cloudfunctions.net/hooks/share/${profile.username}?timezone=Europe/Berlin`
  )

  const socialCover = result.data.url

  await db.collection('shares').add({
    createdAt: +new Date(),
    createdBy: profile.id,
    state: 'new',
    collection: 'profiles',
    contentId: profile.id,
    image: result.data.url,
    url: `https://wedance.vip/${profile.username}`,
    place: profile.place
  })

  await db
    .collection('profiles')
    .doc(profile.id)
    .update({
      socialCover
    })
}
