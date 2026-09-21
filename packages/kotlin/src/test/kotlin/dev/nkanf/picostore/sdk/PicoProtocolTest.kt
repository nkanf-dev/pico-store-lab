package dev.nkanf.picostore.sdk

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class PicoProtocolTest {
    private val fixture = JSONObject(File("../../contracts/v1/fixtures.json").readText())

    @Test fun exactItemAndRequest() {
        val request = PicoProtocol.publicItemRequest(1)
        val item = PicoProtocol.parsePublicItem(fixture.getString("publicResponse"))
        assertEquals(fixture.getString("packageName"), JSONObject(request.body).getString("package_name"))
        assertEquals(fixture.getString("itemId"), item.itemId)
        assertEquals(fixture.getLong("versionCode"), item.versionCode)
        assertEquals("eligible", PicoProtocol.mirrorDecision(item.price, 1).name.lowercase())
    }

    @Test fun validatedDownloadAndRejection() {
        val info = PicoProtocol.parseDownloadInfo(fixture.getString("downloadResponse"))
        assertEquals(fixture.getLong("apkSize"), info.size)
        assertEquals(fixture.getString("md5"), info.md5)
        val wrong = JSONObject(fixture.getString("publicResponse"))
        wrong.getJSONObject("data").put("package_name", "com.example.wrong")
        assertThrows(IllegalArgumentException::class.java) { PicoProtocol.parsePublicItem(wrong.toString()) }
    }

    @Test fun searchFindsNonSeedApp() {
        val request = PicoProtocol.searchRequest("YouTube")
        assertEquals("YouTube", JSONObject(request.body).getString("word"))
        val response = """{"code":0,"data":{"search_list":[{"items":[
            {"item_id":7270207384512020485,"package_name":"com.google.android.apps.youtube.vr.pico","name":"YouTube VR"},
            {"item_id":7574402934302343167,"name":"Bundle"}]}]}}"""
        val results = PicoProtocol.parseSearchResults(response)
        assertEquals(1, results.size)
        assertEquals("7270207384512020485", results[0].itemId)
    }

    @Test fun genericHttpArtworkAndDescriptionRemainAvailable() {
        val target = StoreTarget("7270207384512020485", "com.google.android.apps.youtube.vr.pico")
        val payload = JSONObject().put("code", 0).put("data", JSONObject()
            .put("item_id", target.itemId).put("package_name", target.packageName)
            .put("name", "YouTube VR").put("version_code", 18713000).put("price", "0")
            .put("icon", "http://cdn.example.com/icon.jpg")
            .put("cover", JSONObject().put("landscape", "https://images.example.net/cover.jpg"))
            .put("abstract", "Watch in VR")
            .put("description", JSONObject().put("app_description", "Full description"))
            .put("images", org.json.JSONArray()
                .put(JSONObject().put("image_url", "https://images.example.net/shot.jpg"))
                .put(JSONObject().put("image_url", "http://cdn.example.com/shot-2.jpg")))
            .put("detail", JSONObject().put("app_publisher", "Google LLC").put("app_genres", "Video"))
            .put("age_rating", JSONObject().put("name", "12+")))
        val item = PicoProtocol.parsePublicItem(payload.toString(), target)
        assertEquals("http://cdn.example.com/icon.jpg", item.iconUrl)
        assertEquals("https://images.example.net/cover.jpg", item.coverUrl)
        assertEquals("Full description", item.description)
        assertEquals(2, item.screenshots.size)
        assertEquals("12+", item.ageRating)
        assertEquals("Google LLC", item.publisher)
    }
}
