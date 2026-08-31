package com.sightseeingshkodra.gps

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class QueuedPosition(val id: Long, val payload: String, val sequence: Long)

class GpsQueue(context: Context) : SQLiteOpenHelper(context, "gps_queue.db", null, 2) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE reports (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "event_id TEXT NOT NULL UNIQUE," +
                "sequence_number INTEGER NOT NULL DEFAULT 0," +
                "payload TEXT NOT NULL," +
                "created_at INTEGER NOT NULL," +
                "retry_count INTEGER NOT NULL DEFAULT 0)",
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE reports ADD COLUMN sequence_number INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE reports ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0")
        }
    }

    fun enqueue(eventId: String, sequence: Long, payload: String) {
        writableDatabase.insertWithOnConflict(
            "reports",
            null,
            ContentValues().apply {
                put("event_id", eventId)
                put("sequence_number", sequence)
                put("payload", payload)
                put("created_at", System.currentTimeMillis())
            },
            SQLiteDatabase.CONFLICT_IGNORE,
        )
        writableDatabase.execSQL(
            "DELETE FROM reports WHERE id NOT IN " +
                "(SELECT id FROM reports ORDER BY id DESC LIMIT ?)",
            arrayOf(MAX_QUEUED_REPORTS),
        )
    }

    fun first(): QueuedPosition? = readableDatabase.query(
        "reports",
        arrayOf("id", "payload", "sequence_number"),
        null,
        null,
        null,
        null,
        "id ASC",
        "1",
    ).use { cursor ->
        if (!cursor.moveToFirst()) null
        else QueuedPosition(cursor.getLong(0), cursor.getString(1), cursor.getLong(2))
    }

    fun latest(): QueuedPosition? = readableDatabase.query(
        "reports",
        arrayOf("id", "payload", "sequence_number"),
        null,
        null,
        null,
        null,
        "sequence_number DESC, id DESC",
        "1",
    ).use { cursor ->
        if (!cursor.moveToFirst()) null
        else QueuedPosition(cursor.getLong(0), cursor.getString(1), cursor.getLong(2))
    }

    fun incrementRetry(id: Long) {
        writableDatabase.execSQL("UPDATE reports SET retry_count = retry_count + 1 WHERE id = ?", arrayOf(id))
    }

    fun remove(id: Long) {
        writableDatabase.delete("reports", "id = ?", arrayOf(id.toString()))
    }

    fun removeThroughSequence(sequence: Long) {
        writableDatabase.delete(
            "reports",
            "sequence_number <= ?",
            arrayOf(sequence.toString()),
        )
    }

    fun count(): Long = readableDatabase.compileStatement("SELECT COUNT(*) FROM reports").simpleQueryForLong()

    companion object {
        private const val MAX_QUEUED_REPORTS = 20_000
    }
}
