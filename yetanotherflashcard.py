from google.appengine.api import users
from google.appengine.ext import db
from google.appengine.api.app_identity import get_default_version_hostname
import base64
import binascii
import hashlib
import hmac
import jinja2
import json
import logging
import os
import re
import time
import webapp2

EPOCH = 1389254400

JINJA = jinja2.Environment(
  loader=jinja2.FileSystemLoader(os.path.dirname(__file__)),
  extensions=['jinja2.ext.autoescape'],
  autoescape=True)

JINJA.filters['regex_replace'] = lambda s, find, replace: re.sub(find, replace, s)

PROD = not os.environ.get('SERVER_SOFTWARE', '').startswith('Dev')

# Limit the number of domains that the user must allow to 2:
# 1. Index is served on the default version hostname and sets CSP script-src
# 'self', so plugins must be served on the default version hostname as well,
# provided that the user has installed them. Plugins can therefore see all
# CSRF cookies available on the default version hostname (just Sync).
# 2. Manage, Add, Edit, Remove, Upload, Create, Publish use CSRF cookies that
# should not be available to plugins, so they must be on a different domain, that is
# SECURE_HOST.
# See the comment in the Text handler class about how it uses the different
# domains.
DEFAULT_HOST = get_default_version_hostname()
INSECURE_ORIGIN = 'http://' + DEFAULT_HOST
if PROD:
  SECURE_HOST = 's-dot-' + DEFAULT_HOST
  SECURE_ORIGIN = 'https://' + SECURE_HOST
else:
  SECURE_HOST = DEFAULT_HOST
  SECURE_ORIGIN = INSECURE_ORIGIN

handlers = []
def handler(path_re, path=None):
  if path is None: path = path_re
  class Base(webapp2.RequestHandler):
    PATH = path
    SECURE_URL = SECURE_ORIGIN + PATH
    class __metaclass__(type):
      def __init__(cls, name, bases, dct):
        type.__init__(cls, name, bases, dct)
        if webapp2.RequestHandler not in bases:
          handlers.append((path_re, cls))
    def abortif(self, expr, do, error=(), info=()):
      if expr:
        if error: logging.error(*error)
        if info: logging.info(*info)
        if isinstance(do, int):
          self.abort(do)
        assert isinstance(do, basestring), do
        self.redirect(do, abort=True)
    def _user(self, do):
      self.abortif(not users.get_current_user(), do, info=('_user',))
    def _origin(self, origin, path=''):
      self.abortif(PROD and (origin != (self.request.scheme + '://' + self.request.host)),
                   origin + (path or self.PATH), info=('_origin',))
    def _uploaded(self, shared):
      user = users.get_current_user().nickname()
      self.abortif(not shared, Manage.SECURE_URL + '#e=0', ('not shared',))
      self.abortif(user != shared.uploaded_by, Manage.SECURE_URL + '#e=2',
                   ('uploaded_by=%r != user=%r', shared.uploaded_by, user))
    def _published(self, shared):
      self.abortif(not shared, Manage.SECURE_URL + '#e=0')
      self.abortif(shared.published, Manage.SECURE_URL + '#e=4',
                   ('published %r', shared.key().id()))
    def _unpublished(self, shared):
      self.abortif(not shared, Manage.SECURE_URL + '#e=0', ('not shared',))
      self.abortif((not shared.published) and
          (users.get_current_user().nickname() != shared.uploaded_by),
          Manage.SECURE_URL + '#e=3', info=('_unpublished',))
    def _csrf(self, redirect, param, field='', timeout=0):
      self.abortif(PROD and not CSRF.verify(self, param, field=field, timeout=timeout),
                   redirect, ('_csrf',))
  return Base

def strip_port(hostname):
  if ':' in hostname: return hostname[:hostname.index(':')]
  return hostname

def as_unicode(s):
  if isinstance(s, str): return unicode(s, 'utf-8')
  else: return unicode(s)

def parse_files(body):
  body = as_unicode(body)
  lines = re.split('[\r\n]+', body)
  boundaryi = min(body.index('\r'), body.index('\n'))
  boundary = body[:boundaryi].strip()
  files = []
  while body:
    fd = {}
    endofheaders = body[boundaryi:].find('\r\n\r\n')
    if endofheaders < 0: return files
    endofheaders += boundaryi
    headers = body[boundaryi:endofheaders].strip()
    if not headers: return files
    for header in headers.split('\r\n'):
      colon = header.find(':')
      if colon < 0: continue
      name, value = header[:colon].lower().strip(), header[colon+1:].strip()
      fd[name] = value
    if 'content-disposition' in fd:
      for part in fd['content-disposition'].split(';'):
        if part.strip().lower().startswith('filename'):
          eq = part.find('=')
          if eq < 0: continue
          fd['filename'] = part[eq+1:].strip().strip('"').strip()
    endofdata = body[endofheaders:].find(boundary)
    if endofdata < 0: return files
    endofdata += endofheaders
    fd['data'] = body[endofheaders:endofdata].strip()
    if fd['data'] and 'filename' in fd and fd['filename']:
      fd['data'] = as_unicode(fd['data'])
      files.append(fd)
    body = body[endofdata:].strip()
  return files

def parent():
  return db.Key.from_path('User', users.get_current_user().user_id())

def set_cookie(handler, name, value, now=0, expires=0, domain='%', path='%', secure=False, httponly=False):
  s = name + '=' + value
  # expires is seconds from now, e.g. (60 * 60 * 24) = 1 day
  if expires:
    if not now: now = time.time()
    s+= '; Expires=' + time.strftime('%a, %d-%b-%Y %T GMT',
      time.gmtime(now + expires))
  if domain:
    if domain == '%': domain = handler.request.headers.get('Host', '')
    if domain: s+= '; Domain=.' + strip_port(domain)
  if path:
    if path == '%': path = handler.request.path
    s+= '; Path=' + path
  if secure and PROD: s+= '; Secure'
  if httponly: s+= '; HttpOnly'
  if isinstance(s, unicode): s = s.encode('utf-8')
  handler.response.headers.add_header('Set-Cookie', s)

class CSRF(db.Model):
  secret = db.StringProperty(indexed=False)

  DELIM = '.'
  COOKIE = 'CSRF'

  @staticmethod
  def get_or_create():
    entry = CSRF.all().get()
    if entry: return binascii.a2b_hex(entry.secret)
    secret = os.urandom(1024/8)
    CSRF(secret=binascii.b2a_hex(secret)).put()
    logging.info('put CSRF.secret')
    return secret

  @staticmethod
  def hmac(msg):
    return base64.urlsafe_b64encode(hmac.new(
      CSRF.get_or_create(), msg=CSRF.DELIM.join(msg),
      digestmod=hashlib.sha256).digest()).strip('=')

  @staticmethod
  def sign(handler, param='', **kw):
    assert CSRF.DELIM not in param
    now = str(int(time.time()))
    token = CSRF.hmac([users.get_current_user().user_id(), param, now]) + CSRF.DELIM + now
    set_cookie(handler, CSRF.COOKIE + param, token, **kw)

  @staticmethod
  def verify(handler, param='', field='', timeout=0):
    assert param
    assert timeout
    assert CSRF.DELIM not in param
    if not field: field = handler.request.get(CSRF.COOKIE + param)
    cookie = handler.request.cookies.get(CSRF.COOKIE + param)
    if field != cookie:
      logging.error('field=%r cookie=%r', field, cookie)
      return False
    now = int(time.time())
    hmac, issue_time = field.split(CSRF.DELIM)
    expected = CSRF.hmac([users.get_current_user().user_id(), param, issue_time])
    if (hmac != expected) or (not issue_time.isdigit()) or (now > int(issue_time) + timeout):
      logging.error('hmac=%r expected=%r issue_time=%r', hmac, expected, issue_time)
      return False
    return True

class ShortPair(db.Model):
  t = db.IntegerProperty()
  k = db.StringProperty()
  v = db.StringProperty(indexed=False)

  @staticmethod
  def update(t, k, v):
    if k == 't' or k == 'c': return
    i = ShortPair.all().ancestor(parent()).filter('k', k).get()
    if i:
      i.t = t
      i.v = v
    else:
      i = ShortPair(parent=parent(), t=t, k=k, v=v)
    i.put()
    return i

def fingerprint(s):
  if isinstance(s, unicode): s = s.encode('utf-8')
  return hashlib.sha256(s).hexdigest()

class LongShared(db.Model):
  text = db.TextProperty()
  like = db.StringProperty()
  uploaded_by = db.StringProperty()
  uploaded_at = db.DateTimeProperty(auto_now_add=True)
  title = db.StringProperty()
  published = db.BooleanProperty(default=False)
  fingerprint = db.StringProperty()

  CSV = 'csv'
  JS = 'js'

  def count_users(self):
    return len(list(LongReference.all().filter('shared', self).filter('removed', False)))

  def mime(self):
    if self.like == LongShared.CSV:
      return 'text/csv'
    if self.like == LongShared.JS:
      return 'application/javascript'
    return 'text/plain'

  @staticmethod
  def get_or_create(f):
    title = os.path.splitext(f['filename'])[0]
    is_csv = (f['content-type'] == 'text/csv') or f['filename'].lower().endswith('.' + LongShared.CSV)
    is_js = (f['content-type'] == 'application/javascript') or f['filename'].lower().endswith('.' + LongShared.JS)
    logging.info('LongShared.get_or_create csv=%r js=%r title=%r', is_csv, is_js, title)
    if is_csv:
      like = LongShared.CSV
    elif is_js:
      like = LongShared.JS
    else:
      return
    shared = LongShared(like=like,
                        title=title,
                        text=f['data'],
                        fingerprint=fingerprint(f['data']),
                        uploaded_by=users.get_current_user().nickname())
    shared.put()
    logging.info('LongShared.get_or_create %r', shared.key().id())
    return shared

class LongReference(db.Model):
  shared = db.ReferenceProperty(LongShared, required=True)
  removed = db.BooleanProperty(default=False)
  added_at = db.DateTimeProperty(auto_now_add=True)

  def shared_id(self): return self.shared.key().id()

  @staticmethod
  def for_user():
    decks, plugins, removed_decks, removed_plugins = [], [], [], []
    for ref in LongReference.all().ancestor(parent()):
      if ref.shared.like == LongShared.CSV:
        if ref.removed:
          removed_decks.append(ref)
        else:
          decks.append(ref)
      elif ref.shared.like == LongShared.JS:
        if ref.removed:
          removed_plugins.append(ref)
        else:
          plugins.append(ref)
    removed_decks.sort(key=lambda ref: ref.shared_id())
    removed_plugins.sort(key=lambda ref: ref.shared_id())
    decks.sort(key=lambda ref: ref.shared_id())
    plugins.sort(key=lambda ref: ref.shared_id())
    return decks, plugins, removed_decks, removed_plugins

class CSPViolationReport(db.Model):
  doc = db.StringProperty()
  ref = db.StringProperty()
  blocked = db.StringProperty()
  directive = db.StringProperty()
  policy = db.StringProperty()
  count = db.IntegerProperty()

class ReportCSPViolation(handler('/reportcspviolation')):
  def post(self):
    report = json.loads(self.request.body)
    if report and 'csp-report' in report: report = report['csp-report']
    self.abortif(not report, 400)
    prev = CSPViolationReport.all().filter(
      'doc', report['document-uri']).filter(
      'ref', report['referrer']).filter(
      'blocked', report['blocked-uri']).filter(
      'directive', report['violated-directive']).filter(
      'policy', report['original-policy']).get()
    if prev:
      prev.count += 1
    else:
      prev = CSPViolationReport(
        doc=report['document-uri'],
        ref=report['referrer'],
        blocked=report['blocked-uri'],
        directive=report['violated-directive'],
        policy=report['original-policy'],
        count=1)
    prev.put()

class Index(handler('/')):
  CSP = ("script-src 'self'; " +
         "style-src 'self'; " +
         "img-src http://*/* https://*/*; " +
         "media-src http://*/* https://*/*; " +
         "frame-src 'none'; " +
         "connect-src http://*/* https://*/*; " +
         "font-src 'none'; " +
         "report-uri " + ReportCSPViolation.PATH)
  URL = 'https://' + DEFAULT_HOST if PROD else INSECURE_ORIGIN

  def get(self):
    self._user(users.create_login_url(Index.URL))
    self._origin(Index.URL, '/')
    decks, plugins, removed_decks, removed_plugins = LongReference.for_user()
    self.abortif(not decks, Manage.SECURE_URL, info=('decks',))

    self.response.headers.add_header('Content-Security-Policy', Index.CSP)
    self.response.headers.add_header('X-Content-Security-Policy', Index.CSP)
    if PROD:
      self.response.headers.add_header('Strict-Transport-Security', 'max-age=31536000')
    CSRF.sign(self, Sync.CSRF_PARAM, expires=Sync.CSRF_EXPIRES, path=False)
    self.response.out.write(JINJA.get_template('index.html').render(dict(
      plugins=[dict(src=(Text.PATH + '?id=' + str(plugin.shared_id())),
                    title=plugin.shared.title,
                    edit=(Edit.SECURE_URL + '?id=' + str(plugin.shared_id())))
               for plugin in plugins],
      decks=[dict(id=deck.shared_id(),
                  title=deck.shared.title,
                  edit=(Edit.SECURE_URL + '?id=' + str(deck.shared_id())),
                  csv=deck.shared.text)
             for deck in decks])))

class AppCache(handler('/yaf.appcache')):
  def get(self):
    self._user(404)
    self._origin(Index.URL, '/')
    decks, plugins, removed_decks, removed_plugins = LongReference.for_user()
    # 404 deletes the appcache, not localStorage. The browser must re-fetch
    # Index, which will redirect to Manage if not decks.
    self.abortif(not decks, 404)

    CSRF.sign(self, Sync.CSRF_PARAM, expires=Sync.CSRF_EXPIRES, path=False)
    self.response.headers['Content-Type'] = 'text/cache-manifest'
    self.response.out.write(JINJA.get_template('yaf.appcache').render(dict(
      user=users.get_current_user().user_id(),
      version=os.environ['CURRENT_VERSION_ID'],
      fingerprints=[ref.shared.fingerprint for ref in decks + plugins],
      plugins=[Text.PATH + '?id=' + str(plugin.shared_id()) for plugin in plugins])))

class Sync(handler('/sync')):
  CSRF_PARAM = 's'
  CSRF_EXPIRES = 60 * 60 * 24 * 3

  def post(self):
    if (not users.get_current_user()) or (PROD and ((self.request.scheme != 'https') or (self.request.host != DEFAULT_HOST))):
      logging.info('x-login-required')
      self.response.headers['X-Login-Required'] = users.create_login_url(Index.URL)
      self.response.set_status(204)
      return
    sent = json.loads(self.request.body)
    self._csrf(403, Sync.CSRF_PARAM, sent.get('c', ''), Sync.CSRF_EXPIRES)

    del sent['c']
    t = sent['t']
    del sent['t']
    CSRF.sign(self, Sync.CSRF_PARAM, expires=Sync.CSRF_EXPIRES, path=False)
    now = int(time.time() - EPOCH)
    missed = dict(t=now)
    for i in ShortPair.all().ancestor(parent()).filter('t >', t):
      # don't filter sent out of missed so that the client can merge changes
      if i.k == 't': continue
      missed[i.k] = i.v
    # TODO should all these updates be in a single txn?
    for k, v in sent.iteritems():
      ShortPair.update(now, k, str(v))
    self.response.out.write(json.dumps(missed))

class Manage(handler('/manage')):
  CSP = ("script-src 'self'; " +
         "style-src 'self'; " +
         "img-src 'self'; " +
         "media-src 'self'; " +
         "frame-src 'none'; " +
         "connect-src 'none'; " +
         "font-src 'none'; " +
         "frame-options 'deny'; " +
         "report-uri " + ReportCSPViolation.PATH)
  CSRF_PARAM = 'm'
  CSRF_EXPIRES = 60 * 60

  def get(self):
    self._user(users.create_login_url(Manage.SECURE_URL))
    self._origin(SECURE_ORIGIN)

    self.response.headers.add_header('Content-Security-Policy', Manage.CSP)
    self.response.headers.add_header('X-Content-Security-Policy', Manage.CSP)
    self.response.headers.add_header('X-Frame-Options', 'DENY')
    if PROD:
      self.response.headers.add_header('Strict-Transport-Security', 'max-age=31536000')
    user = users.get_current_user()
    CSRF.sign(self, Manage.CSRF_PARAM, expires=Manage.CSRF_EXPIRES, secure=True, path=False)
    decks, plugins, removed_decks, removed_plugins = LongReference.for_user()
    # unpublished decks alphabetized by title
    # unpublished plugins alphabetized by title
    # published unremoved decks alphabetized by title
    # published unremoved plugins alphabetized by title
    # removed decks alphabetized by title
    # removed plugins alphabetized by title
    def key(ref): return ref.shared.title + str(ref.shared_id())
    decks.sort(key=key)
    plugins.sort(key=key)
    removed_decks.sort(key=key)
    removed_plugins.sort(key=key)
    def render(ref):
      return dict(id=ref.shared_id(),
                  title=ref.shared.title,
                  like=ref.shared.like,
                  removed=ref.removed,
                  published=ref.shared.published,
                  users=ref.shared.count_users(),
                  uploaded_by=ref.shared.uploaded_by,
                  uploaded_at=ref.shared.uploaded_at.isoformat(),
                  added_at=ref.added_at.isoformat())
    self.response.out.write(JINJA.get_template('manage.html').render(dict(
      user=user.nickname(),
      any_enabled_decks=(len(decks) > 0),
      settings_url=Index.SECURE_URL,
      share_url=Add.SECURE_URL,
      view_url=Text.SECURE_URL,
      edit_url=Edit.SECURE_URL,
      publish_url=Publish.SECURE_URL,
      unpublished=[render(ref) for ref in decks + plugins if not ref.shared.published],
      published=[render(ref) for ref in decks + plugins if ref.shared.published],
      removed=[render(ref) for ref in removed_decks + removed_plugins])))

class Upload(handler('/upload')):
  def post(self):
    self._user(users.create_login_url(Manage.SECURE_URL))
    self._origin(SECURE_ORIGIN, Manage.PATH)
    self._csrf(Manage.SECURE_URL + '#e=0', Manage.CSRF_PARAM, timeout=Manage.CSRF_EXPIRES)

    for f in parse_files(self.request.body):
      shared = LongShared.get_or_create(f)
      if not shared:
        logging.error('unable to get_or_create')
        continue
      ref = LongReference.all().ancestor(parent()).filter('shared', shared).get()
      if not ref:
        ref = LongReference(shared=shared, parent=parent())
      ref.put()
    self.redirect(Manage.SECURE_URL)

class Remove(handler('/remove')):
  def post(self):
    self._user(users.create_login_url(Manage.SECURE_URL))
    self._origin(SECURE_ORIGIN, Manage.PATH)
    self._csrf(Manage.SECURE_URL + '#e=0', Manage.CSRF_PARAM, timeout=Manage.CSRF_EXPIRES)
    shared_id = self.request.get('id')
    shared = None
    ref = None
    if shared_id and shared_id.isdigit():
      shared = LongShared.get_by_id(int(shared_id))
    if shared:
      ref = LongReference.all().ancestor(parent()).filter('shared', shared).get()
    self.abortif(not ref, Manage.SECURE_URL + '#e=1', ('missing %s', shared_id))

    ref.removed = True
    ref.put()
    logging.info('success')
    self.redirect(Manage.SECURE_URL)

class Add(handler('/add')):
  CSRF_PARAM = 'a'
  CSRF_EXPIRES = 60 * 60

  def get(self):
    shared_id = self.request.get('id')
    self._origin(SECURE_ORIGIN, Add.PATH + '?id=' + shared_id)
    shared = None
    like = ''
    if shared_id and shared_id.isdigit():
      shared = LongShared.get_by_id(int(shared_id))
    if shared:
      if shared.like == LongShared.CSV:
        like = 'deck'
      elif shared.like == LongShared.JS:
        like = 'plugin'
    self.abortif(not like, Manage.SECURE_URL + '#e=1')
    self._unpublished(shared)
    ref = LongReference.all().ancestor(parent()).filter('shared', shared).get()
    self.abortif(ref and not ref.removed, Manage.SECURE_URL, info=('not removed %s', shared_id))

    self.response.headers.add_header('Content-Security-Policy', Manage.CSP)
    self.response.headers.add_header('X-Content-Security-Policy', Manage.CSP)
    self.response.headers.add_header('X-Frame-Options', 'DENY')
    if PROD:
      self.response.headers.add_header('Strict-Transport-Security', 'max-age=31536000')
    CSRF.sign(self, Add.CSRF_PARAM + shared_id, expires=Add.CSRF_EXPIRES, secure=True)
    self.response.out.write(JINJA.get_template('add.html').render(dict(
      manage_url=Manage.SECURE_URL,
      username=users.get_current_user().nickname(),
      id=shared_id,
      text=shared.text,
      like=like,
      users=shared.count_users(),
      uploaded_by=shared.uploaded_by,
      uploaded_at=shared.uploaded_at.isoformat(),
      title=shared.title)))

  def post(self):
    shared_id = self.request.get('id')
    self._user(users.create_login_url(Add.SECURE_URL + '?id=' + shared_id))
    self._origin(SECURE_ORIGIN, Add.PATH + '?id=' + shared_id)
    shared = None
    if shared_id and shared_id.isdigit():
      shared = LongShared.get_by_id(int(shared_id))
    self.abortif(not shared, Manage.SECURE_URL + '#e=1')
    self._unpublished(shared)
    self._csrf(Manage.SECURE_URL + '#e=0', Add.CSRF_PARAM + shared_id, timeout=Add.CSRF_EXPIRES)

    ref = LongReference.all().ancestor(parent()).filter('shared', shared).get()
    if not ref:
      ref = LongReference(parent=parent(), shared=shared)
    ref.removed = False
    ref.put()
    logging.info('successful add %s', shared_id)
    self.redirect(Manage.SECURE_URL)

class Text(handler(r'/text.*', '/text')):
  # Index uses CSP to only allow scripts loaded from
  # DEFAULT_HOST.
  # If /text is requested on DEFAULT_HOST, then the browser
  # might be loading it as a script. In this case, check that user has installed
  # it before serving it.
  # If /text is requested on SECURE_URL, then we can serve it regardless of
  # whether the user has it installed because, even if the browser is requesting
  # it for a <script> tag (perhaps created by a mischievous plugin), Index.CSP
  # will prevent it from running.

  def get(self):
    # TODO serve multiple plugins at once?
    shared_id = self.request.get('id')
    shared = None
    if shared_id and shared_id.isdigit():
      shared = LongShared.get_by_id(int(shared_id))
    self.abortif(not shared, 404, ('id=%s', shared_id))
    if PROD and (self.request.host == DEFAULT_HOST):
      self.abortif(self.request.scheme != 'https', 400, ('insecure',))
      self._user(400)
      self.abortif(not shared, 404, ('id=%s', shared_id))
      ref = LongReference.all().ancestor(parent()).filter('shared', shared).get()
      self.abortif(not ref or ref.removed, 404, ('not installed',))

    text = shared.text
    if (shared.like == LongShared.JS) and (
        (not PROD) or (self.request.host == DEFAULT_HOST)):
      # Prevent plugins from accidentally leaking globals
      text = '"use strict";\n(function(PLUGIN_ID){\n' + text + '\n})(' + str(shared.key().id()) + ');\n'
    self.response.headers['Content-Type'] = shared.mime()
    self.response.headers.add_header('Content-Disposition', 'inline')
    self.response.out.write(text)

class Publish(handler('/publish')):
  CSRF_PARAM = 'p'
  CSRF_EXPIRES = 60 * 60

  def get(self):
    self._user(users.create_login_url(Manage.SECURE_URL))
    self._origin(SECURE_ORIGIN, Manage.PATH)
    shared_id = self.request.get('id')
    shared = None
    like = ''
    if shared_id and shared_id.isdigit():
      shared = LongShared.get_by_id(int(shared_id))
    if shared:
      if shared.like == LongShared.CSV:
        like = 'deck'
      elif shared.like == LongShared.JS:
        like = 'plugin'
    self.abortif(not like, Manage.SECURE_URL + '#e=1')
    self._uploaded(shared)

    self.response.headers.add_header('Content-Security-Policy', Manage.CSP)
    self.response.headers.add_header('X-Content-Security-Policy', Manage.CSP)
    self.response.headers.add_header('X-Frame-Options', 'DENY')
    CSRF.sign(self, Publish.CSRF_PARAM + shared_id, expires=Publish.CSRF_EXPIRES, path=False)
    self.response.out.write(JINJA.get_template('publish.html').render(dict(
      manage_url=Manage.SECURE_URL,
      username=users.get_current_user().nickname(),
      id=shared_id,
      text=shared.text,
      like=like,
      title=shared.title)))

  def post(self):
    self._user(users.create_login_url(Manage.SECURE_URL))
    self._origin(SECURE_ORIGIN, Manage.PATH)
    shared_id = self.request.get('id')
    shared = None
    if shared_id and shared_id.isdigit():
      shared = LongShared.get_by_id(int(shared_id))
    self._uploaded(shared)
    self._csrf(Manage.SECURE_URL + '#e=0', Publish.CSRF_PARAM + shared_id,
               timeout=Publish.CSRF_EXPIRES)

    shared.published = True
    shared.put()
    logging.info('success')
    self.redirect(Manage.SECURE_URL)

class Edit(handler('/edit')):
  # codemirror requires style-src 'unsafe-eval'
  CSP = ("script-src 'self'; " +
         "style-src 'self' 'unsafe-eval'; " +
         "img-src 'self'; " +
         "media-src 'self'; " +
         "frame-src 'none'; " +
         "connect-src 'none'; " +
         "font-src 'none'; " +
         "frame-options 'deny'; " +
         "report-uri " + ReportCSPViolation.PATH)
  CSRF_PARAM = 'e'
  CSRF_EXPIRES = 60 * 60 * 3

  def get(self):
    self._user(users.create_login_url(Manage.SECURE_URL))
    self._origin(SECURE_ORIGIN, Manage.PATH)
    shared_id = self.request.get('id')
    shared = None
    ref = None
    like = ''
    if shared_id and shared_id.isdigit():
      shared = LongShared.get_by_id(int(shared_id))
    if shared:
      ref = LongReference.all().ancestor(parent()).filter('shared', shared).get()
    if shared:
      if shared.like == LongShared.CSV:
        like = 'deck'
      elif shared.like == LongShared.JS:
        like = 'plugin'
    self.abortif(not ref or not like, Manage.SECURE_URL + '#e=1')
    self._uploaded(shared)
    self._published(shared)

    self.response.headers.add_header('Content-Security-Policy', Edit.CSP)
    self.response.headers.add_header('X-Content-Security-Policy', Edit.CSP)
    self.response.headers.add_header('X-Frame-Options', 'DENY')
    if PROD:
      self.response.headers.add_header('Strict-Transport-Security', 'max-age=31536000')
    CSRF.sign(self, Edit.CSRF_PARAM + shared_id, expires=Edit.CSRF_EXPIRES, path=False)
    self.response.out.write(JINJA.get_template('edit.html').render(dict(
      manage_url=Manage.SECURE_URL,
      like=like,
      id=shared_id,
      username=users.get_current_user().nickname(),
      title=shared.title,
      text=shared.text)))

  def post(self):
    self._user(users.create_login_url(Manage.SECURE_URL))
    self._origin(SECURE_ORIGIN, Manage.PATH)
    shared_id = self.request.get('id')
    text = self.request.get('text')
    title = self.request.get('title')
    shared = None
    ref = None
    if shared_id and shared_id.isdigit():
      shared = LongShared.get_by_id(int(shared_id))
    if shared:
      ref = LongReference.all().ancestor(parent()).filter('shared', shared).get()
    self.abortif(not ref, Manage.SECURE_URL + '#e=1', ('missing %s', shared_id))
    self._csrf(Manage.SECURE_URL + '#e=0', Edit.CSRF_PARAM + shared_id, timeout=Edit.CSRF_EXPIRES)
    self._uploaded(shared)
    self._published(shared)

    shared.title = as_unicode(title)
    shared.text = as_unicode(text)
    shared.fingerprint = fingerprint(shared.text)
    shared.put()
    self.redirect(Index.URL)

class Create(handler('/create')):
  def post(self):
    self._user(users.create_login_url(Manage.SECURE_URL))
    self._origin(SECURE_ORIGIN, Manage.PATH)
    self._csrf(Manage.SECURE_URL + '#e=0', Manage.CSRF_PARAM, timeout=Manage.CSRF_EXPIRES)
    like = ''
    title = 'New '
    if self.request.get('deck'):
      like = LongShared.CSV
      title += 'Deck'
    elif self.request.get('plugin'):
      like = LongShared.JS
      title += 'Plugin'
    self.abortif(not like, Manage.SECURE_URL)

    shared = LongShared(like=like,
                        title=title,
                        text='',
                        fingerprint=fingerprint(''),
                        uploaded_by=users.get_current_user().nickname())
    shared.put()
    ref = LongReference(parent=parent(), shared=shared)
    ref.put()
    self.redirect(Edit.SECURE_URL + '?id=' + str(shared.key().id()))

app = webapp2.WSGIApplication(handlers)
