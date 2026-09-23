package dev.nkanf.picostore

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class NoAdaptationPolicyTest {
    private val rule = """[{"packageName":"com.vrchat.android","reason":{"zh":"使用自己的账号登录","en":"Use your own account"}}]"""

    @Test fun markedAppUsesOriginalCopyAndShowsTheReason() {
        val policy = NoAdaptationPolicy.parse(rule)
        assertEquals("使用自己的账号登录", policy.reason("com.vrchat.android")?.forLanguage("zh"))
        assertEquals(InstallVariant.ORIGINAL, policy.installationChoice("com.vrchat.android", null))
        assertEquals(InstallVariant.ORIGINAL, policy.installationChoice("com.vrchat.android", InstallVariant.ADAPTED))
        assertNull(policy.reason("another.app"))
        assertNull(policy.installationChoice("another.app", null))
    }

    @Test fun duplicateRulesAreRejected() {
        val duplicate = rule.dropLast(1) + "," + rule.drop(1)
        assertThrows(IllegalArgumentException::class.java) { NoAdaptationPolicy.parse(duplicate) }
    }
}
