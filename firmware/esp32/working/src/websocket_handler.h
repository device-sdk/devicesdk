#ifndef WEBSOCKET_HANDLER_H
#define WEBSOCKET_HANDLER_H

#include "picojson.h"

void handle_websocket_message(const picojson::value& payload);

#endif // WEBSOCKET_HANDLER_H
