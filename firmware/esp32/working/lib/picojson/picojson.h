/*
 * Copyright 2009-2010 Cybozu Labs, Inc.
 * Copyright 2011-2014 Kazuho Oku
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
#ifndef picojson_h
#define picojson_h

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <iterator>
#include <limits>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>
#include <cmath>

#ifndef PICOJSON_USE_EXCEPTIONS
#define PICOJSON_USE_EXCEPTIONS 0
#endif

#if PICOJSON_USE_EXCEPTIONS
#include <stdexcept>
#endif

#ifdef _MSC_VER
#pragma warning(push)
#pragma warning(disable : 4244) // conversion from int to char
#endif

namespace picojson {

  enum {
    null_type,
    boolean_type,
    number_type,
    string_type,
    array_type,
    object_type
  };

  struct null {};

  class value {
  public:
    typedef std::vector<value> array;
    typedef std::map<std::string, value> object;
  protected:
    int type_;
    union {
      bool boolean_;
      double number_;
      std::string* string_;
      array* array_;
      object* object_;
    };
  public:
    value();
    value(int type, bool);
    explicit value(bool b);
    explicit value(double n);
    explicit value(const std::string& s);
    explicit value(const array& a);
    explicit value(const object& o);
    explicit value(const char* s);
    value(const char* s, size_t len);
    ~value();
    value(const value& x);
    value& operator=(const value& x);
    void swap(value& x);
    template <typename T> bool is() const;
    template <typename T> const T& get() const;
    template <typename T> T& get();
    const value& get(size_t idx) const;
    const value& get(const std::string& key) const;
    value& get(size_t idx);
    value& get(const std::string& key);
    std::string to_str() const;
    template <typename Iter> void serialize(Iter os) const;
    std::string serialize() const;
  private:
    template <typename Iter> void _serialize(Iter os) const;
  };

  typedef value::array array;
  typedef value::object object;

  inline value::value() : type_(null_type) {}
  inline value::value(int type, bool) : type_(type) {}
  inline value::value(bool b) : type_(boolean_type) {
    boolean_ = b;
  }
  inline value::value(double n) : type_(number_type) {
    number_ = n;
  }
  inline value::value(const std::string& s) : type_(string_type) {
    string_ = new std::string(s);
  }
  inline value::value(const array& a) : type_(array_type) {
    array_ = new array(a);
  }
  inline value::value(const object& o) : type_(object_type) {
    object_ = new object(o);
  }
  inline value::value(const char* s) : type_(string_type) {
    string_ = new std::string(s);
  }
  inline value::value(const char* s, size_t len) : type_(string_type) {
    string_ = new std::string(s, len);
  }
  inline value::~value() {
    switch (type_) {
      case string_type: delete string_; break;
      case array_type: delete array_; break;
      case object_type: delete object_; break;
      default: break;
    }
  }
  inline value::value(const value& x) : type_(x.type_) {
    switch (type_) {
      case string_type: string_ = new std::string(*x.string_); break;
      case array_type: array_ = new array(*x.array_); break;
      case object_type: object_ = new object(*x.object_); break;
      default:
        boolean_ = x.boolean_;
        number_ = x.number_;
        break;
    }
  }
  inline value& value::operator=(const value& x) {
    if (this != &x) {
      this->~value();
      new (this) value(x);
    }
    return *this;
  }
  inline void value::swap(value& x) {
    std::swap(type_, x.type_);
    std::swap(boolean_, x.boolean_);
  }

  template <typename T> inline bool value::is() const { return false; }
  template <> inline bool value::is<null>() const { return type_ == null_type; }
  template <> inline bool value::is<bool>() const { return type_ == boolean_type; }
  template <> inline bool value::is<double>() const { return type_ == number_type; }
  template <> inline bool value::is<std::string>() const { return type_ == string_type; }
  template <> inline bool value::is<array>() const { return type_ == array_type; }
  template <> inline bool value::is<object>() const { return type_ == object_type; }

  template <typename T> inline const T& value::get() const {
#if PICOJSON_USE_EXCEPTIONS
    throw std::logic_error("invalid type");
#else
    static T defaultValue = T();
    return defaultValue;
#endif
  }
  template <typename T> inline T& value::get() {
#if PICOJSON_USE_EXCEPTIONS
    throw std::logic_error("invalid type");
#else
    static T defaultValue = T();
    return defaultValue;
#endif
  }
  template <> inline const bool& value::get<bool>() const { return boolean_; }
  template <> inline bool& value::get<bool>() { return boolean_; }
  template <> inline const double& value::get<double>() const { return number_; }
  template <> inline double& value::get<double>() { return number_; }
  template <> inline const std::string& value::get<std::string>() const { return *string_; }
  template <> inline std::string& value::get<std::string>() { return *string_; }
  template <> inline const array& value::get<array>() const { return *array_; }
  template <> inline array& value::get<array>() { return *array_; }
  template <> inline const object& value::get<object>() const { return *object_; }
  template <> inline object& value::get<object>() { return *object_; }

  inline const value& value::get(size_t idx) const {
    static value s_null;
    return idx < array_->size() ? (*array_)[idx] : s_null;
  }
  inline value& value::get(size_t idx) {
    static value s_null;
    return idx < array_->size() ? (*array_)[idx] : s_null;
  }
  inline const value& value::get(const std::string& key) const {
    static value s_null;
    object::const_iterator i = object_->find(key);
    return i != object_->end() ? i->second : s_null;
  }
  inline value& value::get(const std::string& key) {
    static value s_null;
    object::iterator i = object_->find(key);
    return i != object_->end() ? i->second : s_null;
  }

  inline std::string value::to_str() const {
    switch (type_) {
      case null_type: return "null";
      case boolean_type: return boolean_ ? "true" : "false";
      case number_type: {
        char buf[256];
        sprintf(buf, "%.17g", number_);
        return buf;
      }
      case string_type: return *string_;
      case array_type: return "array";
      case object_type: return "object";
      default: return "";
    }
  }

  template <typename Iter>
  void value::serialize(Iter os) const {
    _serialize(os);
  }

  inline std::string value::serialize() const {
    std::string s;
    serialize(std::back_inserter(s));
    return s;
  }

  template <typename Iter>
  void value::_serialize(Iter os) const {
    switch (type_) {
      case string_type:
        *os++ = '"';
        for (std::string::const_iterator i = string_->begin(); i != string_->end(); ++i) {
          switch (*i) {
            case '"': *os++ = '\\'; *os++ = '"'; break;
            case '\\': *os++ = '\\'; *os++ = '\\'; break;
            case '/': *os++ = '\\'; *os++ = '/'; break;
            case '\b': *os++ = '\\'; *os++ = 'b'; break;
            case '\f': *os++ = '\\'; *os++ = 'f'; break;
            case '\n': *os++ = '\\'; *os++ = 'n'; break;
            case '\r': *os++ = '\\'; *os++ = 'r'; break;
            case '\t': *os++ = '\\'; *os++ = 't'; break;
            default:
              if (static_cast<unsigned char>(*i) < 0x20) {
                char buf[7];
                sprintf(buf, "\\u%04x", *i & 0xff);
                for(int j=0; j<6; ++j) *os++ = buf[j];
              } else {
                *os++ = *i;
              }
              break;
          }
        }
        *os++ = '"';
        break;
      case array_type:
        *os++ = '[';
        for (array::const_iterator i = array_->begin(); i != array_->end(); ++i) {
          if (i != array_->begin()) *os++ = ',';
          i->_serialize(os);
        }
        *os++ = ']';
        break;
      case object_type:
        *os++ = '{';
        for (object::const_iterator i = object_->begin(); i != object_->end(); ++i) {
          if (i != object_->begin()) *os++ = ',';
          value(i->first)._serialize(os);
          *os++ = ':';
          i->second._serialize(os);
        }
        *os++ = '}';
        break;
      default:
        for(const char* p = to_str().c_str(); *p != '\0'; ++p) *os++ = *p;
        break;
    }
  }

  template <typename Iter>
  class input {
  protected:
    Iter cur_, end_;
    int last_ch_;
    bool ungot_;
    int line_no_;
  public:
    input(const Iter& first, const Iter& last) : cur_(first), end_(last), last_ch_(-1), ungot_(false), line_no_(1) {}
    int getc() {
      if (ungot_) {
        ungot_ = false;
        return last_ch_;
      }
      if (cur_ == end_) {
        last_ch_ = -1;
        return -1;
      }
      last_ch_ = *cur_++ & 0xff;
      if (last_ch_ == '\n') {
        line_no_++;
      }
      return last_ch_;
    }
    void ungetc() {
      if (last_ch_ != -1) {
        ungot_ = true;
      }
    }
    Iter cur() const { return cur_; }
    int line_no() const { return line_no_; }
    void skip_ws() {
      while (1) {
        int ch = getc();
        if (! (ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r')) {
          ungetc();
          break;
        }
      }
    }
    bool expect(int expect) {
      skip_ws();
      if (getc() != expect) {
        ungetc();
        return false;
      }
      return true;
    }
    bool match(const std::string& pattern) {
      for (std::string::const_iterator i = pattern.begin(); i != pattern.end(); ++i) {
        if (getc() != *i) {
          ungetc();
          return false;
        }
      }
      return true;
    }
  };

  template<typename Iter>
  inline int _parse_quadhex(input<Iter>& in) {
    int uni = 0;
    for (int i = 0; i < 4; i++) {
      int ch = in.getc();
      if (ch == -1) return -1;
      if ('0' <= ch && ch <= '9') {
        uni = uni * 16 + ch - '0';
      } else if ('a' <= ch && ch <= 'f') {
        uni = uni * 16 + ch - 'a' + 10;
      } else if ('A' <= ch && ch <= 'F') {
        uni = uni * 16 + ch - 'A' + 10;
      } else {
        in.ungetc();
        return -1;
      }
    }
    return uni;
  }

  template<typename Iter, typename String>
  inline bool _parse_codepoint(String& s, input<Iter>& in) {
    int uni = _parse_quadhex(in);
    if (uni == -1) return false;
    if (0xd800 <= uni && uni <= 0xdbff) {
      if (in.getc() == '\\' && in.getc() == 'u') {
        int uni2 = _parse_quadhex(in);
        if (uni2 != -1 && 0xdc00 <= uni2 && uni2 <= 0xdfff) {
          uni = ((uni - 0xd800) << 10) | (uni2 - 0xdc00);
          uni += 0x10000;
        } else {
          return false;
        }
      } else {
        return false;
      }
    }
    if (uni < 0x80) {
      s += (char)uni;
    } else if (uni < 0x800) {
      s += (char)(0xc0 | (uni >> 6));
      s += (char)(0x80 | (uni & 0x3f));
    } else if (uni < 0x10000) {
      s += (char)(0xe0 | (uni >> 12));
      s += (char)(0x80 | ((uni >> 6) & 0x3f));
      s += (char)(0x80 | (uni & 0x3f));
    } else {
      s += (char)(0xf0 | (uni >> 18));
      s += (char)(0x80 | ((uni >> 12) & 0x3f));
      s += (char)(0x80 | ((uni >> 6) & 0x3f));
      s += (char)(0x80 | (uni & 0x3f));
    }
    return true;
  }

  template<typename Iter, typename String>
  inline bool _parse_string(value& out, input<Iter>& in, String& err) {
    std::string s;
    if (! in.expect('"')) {
      err = "expected '\'' at the beginning of a string";
      return false;
    }
    while (1) {
      int ch = in.getc();
      if (ch < ' ') {
        in.ungetc();
        err = "invalid character in a string";
        return false;
      } else if (ch == '"') {
        out = value(s);
        return true;
      } else if (ch == '\\') {
        switch (in.getc()) {
          case '"': s += '"'; break;
          case '\\': s += '\\'; break;
          case '/': s += '/'; break;
          case 'b': s += '\b'; break;
          case 'f': s += '\f'; break;
          case 'n': s += '\n'; break;
          case 'r': s += '\r'; break;
          case 't': s += '\t'; break;
          case 'u':
            if (! _parse_codepoint(s, in)) {
              err = "invalid unicode escape sequence";
              return false;
            }
            break;
          default:
            err = "invalid escape sequence";
            return false;
        }
      } else {
        s += (char)ch;
      }
    }
  }

  template<typename Iter, typename String>
  inline bool _parse_array(value& out, input<Iter>& in, String& err) {
    array a;
    if (! in.expect('[')) {
      err = "expected '[' at the beginning of an array";
      return false;
    }
    in.skip_ws();
    if (in.expect(']')) {
      out = value(a);
      return true;
    }
    while (1) {
      value v;
      if (! _parse(v, in, err)) return false;
      a.push_back(v);
      in.skip_ws();
      if (! in.expect(',')) {
        if (in.expect(']')) {
          out = value(a);
          return true;
        }
        err = "expected ',' or ']' at the end of an array";
        return false;
      }
    }
  }

  template<typename Iter, typename String>
  inline bool _parse_object(value& out, input<Iter>& in, String& err) {
    object o;
    if (! in.expect('{')) {
      err = "expected '{' at the beginning of an object";
      return false;
    }
    in.skip_ws();
    if (in.expect('}')) {
      out = value(o);
      return true;
    }
    while (1) {
      value key, val;
      if (! _parse_string(key, in, err)) return false;
      if (! in.expect(':')) {
        err = "expected ':' after a key";
        return false;
      }
      if (! _parse(val, in, err)) return false;
      o[key.get<std::string>()] = val;
      in.skip_ws();
      if (! in.expect(',')) {
        if (in.expect('}')) {
          out = value(o);
          return true;
        }
        err = "expected ',' or '}' at the end of an object";
        return false;
      }
    }
  }

  template<typename Iter, typename String>
  inline bool _parse_number(value& out, input<Iter>& in, String& err) {
    std::string s;
    int ch = in.getc();
    if (ch == '-') {
      s += '-';
      ch = in.getc();
    }
    if (! ('0' <= ch && ch <= '9')) {
      err = "invalid character for a number";
      return false;
    }
    s += (char)ch;
    if (ch == '0') {
      ch = in.getc();
      if ('0' <= ch && ch <= '9') {
        err = "leading zeros are not allowed";
        return false;
      }
    } else {
      while ('0' <= (ch = in.getc()) && ch <= '9') {
        s += (char)ch;
      }
    }
    if (ch == '.') {
      s += '.';
      while ('0' <= (ch = in.getc()) && ch <= '9') {
        s += (char)ch;
      }
    }
    if (ch == 'e' || ch == 'E') {
      s += 'e';
      ch = in.getc();
      if (ch == '+' || ch == '-') {
        s += (char)ch;
        ch = in.getc();
      }
      if (! ('0' <= ch && ch <= '9')) {
        err = "invalid character for an exponent";
        return false;
      }
      s += (char)ch;
      while ('0' <= (ch = in.getc()) && ch <= '9') {
        s += (char)ch;
      }
    }
    in.ungetc();
    char* endp;
    out = value(strtod(s.c_str(), &endp));
    return true;
  }

  template<typename Iter, typename String>
  inline bool _parse(value& out, input<Iter>& in, String& err) {
    in.skip_ws();
    int ch = in.getc();
    in.ungetc();
    switch (ch) {
      case 'n':
        if (in.match("null")) {
          out = value();
          return true;
        }
        break;
      case 't':
        if (in.match("true")) {
          out = value(true);
          return true;
        }
        break;
      case 'f':
        if (in.match("false")) {
          out = value(false);
          return true;
        }
        break;
      case '"': return _parse_string(out, in, err); 
      case '[': return _parse_array(out, in, err);
      case '{': return _parse_object(out, in, err);
      default:
        if (('0' <= ch && ch <= '9') || ch == '-') {
          return _parse_number(out, in, err);
        }
        break;
    }
    err = "unexpected character";
    return false;
  }

  template <typename Iter>
  inline std::string parse(value& out, const Iter& first, const Iter& last) {
    std::string err;
    input<Iter> in(first, last);
    if (! _parse(out, in, err)) {
      char buf[64];
      sprintf(buf, "error at line %d", in.line_no());
      err += ", ";
      err += buf;
    }
    return err;
  }

  inline std::string parse(value& out, const std::string& s) {
    return parse(out, s.begin(), s.end());
  }

  inline std::string parse(value& out, std::istream& is) {
    return parse(out, std::istreambuf_iterator<char>(is.rdbuf()), std::istreambuf_iterator<char>());
  }

} 

#ifdef _MSC_VER
#pragma warning(pop)
#endif

#endif